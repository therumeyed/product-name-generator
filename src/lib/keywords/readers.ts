import { parse } from "csv-parse";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export type RawRow = { rowNumber: number; cells: Record<string, unknown> };
export type RowSource = { headers: string[]; rows: AsyncIterable<RawRow> };

const cellValue = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === "object") {
    if ("result" in v) return (v as { result: unknown }).result; // formula
    if ("text" in v) return (v as { text: string }).text; // hyperlink
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    if (v instanceof Date) return v.toISOString();
  }
  return v;
};

/** Streams a CSV buffer. rowNumber is the 1-based spreadsheet row (header = 1). */
export async function openCsv(buf: Buffer): Promise<RowSource> {
  const parser = Readable.from(buf).pipe(
    parse({ bom: true, columns: false, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: false }),
  );
  const it = parser[Symbol.asyncIterator]();
  const first = await it.next();
  if (first.done) throw new Error("File is empty");
  const headers = (first.value as string[]).map((h) => String(h).trim());
  async function* rows(): AsyncGenerator<RawRow> {
    let n = 1;
    for (;;) {
      const r = await it.next();
      if (r.done) return;
      n++;
      const cells: Record<string, unknown> = {};
      headers.forEach((h, i) => (cells[h] = (r.value as string[])[i]));
      yield { rowNumber: n, cells };
    }
  }
  return { headers, rows: rows() };
}

/** Streams the chosen (or first) worksheet of an .xlsx buffer. */
export async function openXlsx(buf: Buffer, sheet?: string): Promise<RowSource> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = (sheet ? wb.getWorksheet(sheet) : wb.worksheets[0]) ?? undefined;
  if (!ws) throw new Error(sheet ? `No sheet named "${sheet}"` : "Workbook has no sheets");
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (c, i) => (headers[i - 1] = String(cellValue(c.value) ?? "").trim()));
  if (!headers.some(Boolean)) throw new Error("First row has no headers");
  async function* rows(): AsyncGenerator<RawRow> {
    for (let r = 2; r <= ws!.rowCount; r++) {
      const row = ws!.getRow(r);
      if (!row.hasValues) continue;
      const cells: Record<string, unknown> = {};
      headers.forEach((h, i) => h && (cells[h] = cellValue(row.getCell(i + 1).value)));
      yield { rowNumber: r, cells };
    }
  }
  return { headers, rows: rows() };
}

export async function openFile(buf: Buffer, filename: string, sheet?: string): Promise<RowSource> {
  if (/\.xlsx$/i.test(filename)) return openXlsx(buf, sheet);
  if (/\.csv$/i.test(filename)) return openCsv(buf);
  throw new Error("Upload a .csv or .xlsx file");
}
