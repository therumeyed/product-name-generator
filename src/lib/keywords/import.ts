import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { cleanOriginal, normalizeKeyword, parseNumber } from "./normalize";
import { combineVolumes, validateMapping, type ColumnMapping, type VolumeRule } from "./mapping";
import type { RowSource } from "./readers";

const BATCH = 2000;
const EXTREME_VOLUME = 10_000_000;
const SAMPLE_CAP = 25;

export type ImportSummary = {
  datasetId: string;
  rowsRead: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  warnings: Record<string, { count: number; sampleRows: number[] }>;
};

/**
 * Validates and imports a keyword file as a NEW dataset version (status "ready").
 * Never touches the brand's active dataset: activation is a separate, explicit step.
 */
export async function importKeywords(opts: {
  brandId: string;
  name: string;
  filename: string;
  source: RowSource;
  mapping: ColumnMapping;
  volumeRule: VolumeRule;
  uploadedById?: string | null;
}): Promise<ImportSummary> {
  const bad = validateMapping(opts.mapping);
  if (bad) throw new Error(bad);

  const byTarget = (t: string) => Object.entries(opts.mapping).filter(([, v]) => v === t).map(([h]) => h);
  const one = (t: string) => byTarget(t)[0];
  const kwCol = one("keyword");
  const volCols = byTarget("volume");
  const metaCols = byTarget("metadata");

  const dataset = await db.keywordDataset.create({
    data: { brandId: opts.brandId, name: opts.name, originalFilename: opts.filename, status: "validating", uploadedById: opts.uploadedById ?? null },
  });

  const warnings: ImportSummary["warnings"] = {};
  const warn = (type: string, row: number) => {
    const w = (warnings[type] ??= { count: 0, sampleRows: [] });
    w.count++;
    if (w.sampleRows.length < SAMPLE_CAP) w.sampleRows.push(row);
  };

  const seen = new Map<string, number>(); // dedupe key -> first row number
  let kwBatch: Prisma.KeywordCreateManyInput[] = [];
  let rejBatch: Prisma.DatasetRejectionCreateManyInput[] = [];
  let rowsRead = 0, accepted = 0, rejected = 0, duplicates = 0;

  const flush = async () => {
    if (kwBatch.length) await db.keyword.createMany({ data: kwBatch });
    if (rejBatch.length) await db.datasetRejection.createMany({ data: rejBatch });
    kwBatch = [];
    rejBatch = [];
  };

  try {
    for await (const { rowNumber, cells } of opts.source.rows) {
      rowsRead++;
      const rawKw = cells[kwCol];
      const original = rawKw == null ? "" : cleanOriginal(String(rawKw));
      const reject = (reason: string) => {
        rejected++;
        rejBatch.push({ datasetId: dataset.id, rowNumber, keyword: original || null, reason, raw: cells as Prisma.InputJsonValue });
      };

      if (!original) { reject("Blank keyword"); continue; }
      const normalized = normalizeKeyword(original);
      const str = (t: string) => {
        const h = one(t);
        const v = h ? cells[h] : null;
        return v == null || String(v).trim() === "" ? null : String(v).trim();
      };
      const country = str("country");
      const language = str("language");

      const key = `${normalized}|${country ?? ""}|${language ?? ""}`;
      const firstRow = seen.get(key);
      if (firstRow !== undefined) {
        duplicates++;
        rejBatch.push({ datasetId: dataset.id, rowNumber, keyword: original, reason: `Duplicate of row ${firstRow} (not merged)`, raw: cells as Prisma.InputJsonValue });
        continue;
      }
      seen.set(key, rowNumber);

      // Volume: parse every mapped volume column, keep each raw value, combine with the chosen rule.
      const volumes: Record<string, number | null> = {};
      for (const h of volCols) {
        const raw = cells[h];
        const n = parseNumber(raw);
        if (raw != null && String(raw).trim() !== "" && n === null) warn("unparseable_volume", rowNumber);
        if (n !== null && n < 0) { warn("negative_volume", rowNumber); volumes[h] = null; continue; }
        volumes[h] = n;
      }
      const searchVolume = volCols.length ? combineVolumes(Object.values(volumes), opts.volumeRule) : null;
      if (searchVolume !== null && searchVolume > EXTREME_VOLUME) warn("extreme_volume", rowNumber);
      if (volCols.length && searchVolume === null) warn("no_volume", rowNumber);

      const num = (t: string) => {
        const h = one(t);
        return h ? parseNumber(cells[h]) : null;
      };
      let sourceUpdatedAt: Date | null = null;
      const upd = str("updated_at");
      if (upd) {
        const d = new Date(upd);
        if (Number.isNaN(d.getTime())) warn("unparseable_date", rowNumber);
        else sourceUpdatedAt = d;
      }

      const metadata: Record<string, unknown> = {};
      if (volCols.length > 1 || volCols.length === 1) metadata.volumes = volumes;
      for (const h of metaCols) if (cells[h] != null && String(cells[h]).trim() !== "") metadata[h] = cells[h];

      const competition = num("competition");
      kwBatch.push({
        datasetId: dataset.id,
        originalKeyword: original,
        normalizedKeyword: normalized,
        searchVolume: searchVolume === null ? null : Math.round(searchVolume),
        category: str("category"),
        subcategory: str("subcategory"),
        competition,
        cpc: num("cpc"),
        intent: str("intent"),
        country,
        language,
        sourceUpdatedAt,
        metadata: metadata as Prisma.InputJsonValue,
      });
      accepted++;
      if (kwBatch.length >= BATCH) await flush();
    }
    await flush();
    if (accepted === 0) throw new Error("No valid rows found in file");

    const summary: ImportSummary = { datasetId: dataset.id, rowsRead, accepted, rejected, duplicates, warnings };
    await db.keywordDataset.update({
      where: { id: dataset.id },
      data: {
        status: "ready",
        rowsAccepted: accepted,
        rowsRejected: rejected,
        rowsDuplicate: duplicates,
        validationSummary: { warnings, volumeRule: opts.volumeRule, mapping: opts.mapping } as unknown as Prisma.InputJsonValue,
      },
    });
    await db.auditEvent.create({
      data: { brandId: opts.brandId, userId: opts.uploadedById ?? null, eventType: "dataset.imported", targetType: "dataset", targetId: dataset.id, metadata: { accepted, rejected, duplicates } },
    });
    return summary;
  } catch (e) {
    // A failed file leaves only a failed version row behind. The active dataset is untouched.
    await db.keyword.deleteMany({ where: { datasetId: dataset.id } });
    await db.keywordDataset.update({
      where: { id: dataset.id },
      data: { status: "failed", validationSummary: { error: e instanceof Error ? e.message : String(e) } },
    });
    throw e;
  }
}
