/* Import a keyword file for a brand (CSV or XLSX), then optionally activate it.
 *   npm run dataset:import -- --brand sportsgirl --file ./keywords.xlsx --name "Generic Oct 2026" \
 *       [--sheet "Generic Keywords"] [--volume-rule max|sum|first_available] [--ignore "Source(s)"] [--activate]
 * Column mapping is auto-detected from headers; --ignore drops columns you don't want kept.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { db } from "../src/lib/db";
import { importKeywords } from "../src/lib/keywords/import";
import { suggestMapping, VOLUME_RULES, type VolumeRule } from "../src/lib/keywords/mapping";
import { openFile } from "../src/lib/keywords/readers";
import { activateDataset } from "../src/lib/keywords/versions";

async function main() {
  const f: Record<string, string> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) if (a[i].startsWith("--")) f[a[i].slice(2)] = a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? "true" : a[++i];
  if (!f.brand || !f.file) throw new Error("Need --brand <slug> and --file <path>");
  const brand = await db.brand.findUnique({ where: { slug: f.brand } });
  if (!brand) throw new Error(`No brand "${f.brand}"`);
  const rule = (f["volume-rule"] ?? "max") as VolumeRule;
  if (!VOLUME_RULES.includes(rule)) throw new Error(`--volume-rule must be one of ${VOLUME_RULES.join(", ")}`);

  const buf = readFileSync(f.file);
  const probe = await openFile(buf, f.file, f.sheet);
  const mapping = suggestMapping(probe.headers);
  for (const h of (f.ignore ?? "").split("|").filter(Boolean)) if (h in mapping) mapping[h] = "ignore";
  console.log("Column mapping:", mapping, "\nVolume rule:", rule);

  const t0 = Date.now();
  const source = await openFile(buf, f.file, f.sheet);
  const s = await importKeywords({ brandId: brand.id, name: f.name ?? basename(f.file), filename: basename(f.file), source, mapping, volumeRule: rule });
  console.log(`Imported in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(s, null, 1));
  if (f.activate) {
    await activateDataset(s.datasetId);
    console.log("Activated", s.datasetId);
  } else console.log("Not activated. Re-run with --activate, or activate it in the app.");
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => db.$disconnect());
