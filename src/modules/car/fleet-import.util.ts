import { BadRequestException } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
// A default import here compiles to `.default` property access, which doesn't exist on
// exceljs's actual CommonJS export shape (it exports `Workbook` directly) — confirmed by
// inspecting the compiled output, since `esModuleInterop` isn't enabled in this project's
// tsconfig. Namespace import matches the real module shape.
import * as ExcelJS from 'exceljs';

/** Hard cap on rows accepted per import — not a real-world fleet size limit, just an abuse/DoS guard on a single request. */
export const MAX_IMPORT_ROWS = 500;

/** The columns a fleet-import file is expected to have — exactly the header text, case/whitespace-insensitive. Only `make`/`model` are required. */
export const IMPORT_COLUMNS = [
  'make', 'model', 'variant', 'year', 'license_plate', 'vin', 'nickname',
  'fuel_type', 'transmission', 'color', 'current_mileage',
] as const;

export type ImportRow = Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>;

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Parses an uploaded CSV file's buffer into header-keyed row objects. Untrusted input — `csv-parse` has no known RCE/ReDoS advisories, unlike the alternative (`xlsx`/SheetJS), which is why it's used here instead. */
function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  const records: string[][] = parseCsv(buffer, { bom: true, skip_empty_lines: true, trim: true });
  if (records.length === 0) return [];
  const headers = records[0].map(normalizeHeader);
  return records.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (row[i] !== undefined && row[i] !== '') obj[h] = row[i]; });
    return obj;
  });
}

/** Parses an uploaded XLSX/XLS file's first sheet into header-keyed row objects, using `exceljs` (actively maintained, unlike `xlsx`/SheetJS which has unpatched high-severity CVEs — see the import endpoint's doc comment). */
async function parseExcelBuffer(buffer: Buffer): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own index.d.ts declares a module-local `Buffer extends ArrayBuffer`
  // (it has to stay browser-safe, so it can't rely on @types/node's global Buffer),
  // which structurally conflicts with Node's real, generic `Buffer` — a long-standing
  // exceljs typing quirk, not a behavior difference. `load()` accepts a real Node
  // Buffer fine at runtime; this cast only works around the type clash.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: Record<string, string>[] = [];
  let headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map(v => (v == null ? '' : String(v).trim()));
    if (rowNumber === 1) {
      headers = values.map(normalizeHeader);
      return;
    }
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (values[i]) obj[h] = values[i]; });
    if (Object.keys(obj).length > 0) rows.push(obj);
  });
  return rows;
}

/** Dispatches to the CSV or Excel parser based on the uploaded file's extension/mimetype, and caps the row count — the only thing standing between an import endpoint and an unbounded parse of arbitrary uploaded data. */
export async function parseFleetImportFile(file: Express.Multer.File): Promise<ImportRow[]> {
  const name = (file.originalname ?? '').toLowerCase();
  const isCsv = name.endsWith('.csv') || file.mimetype === 'text/csv';
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel');

  let rows: Record<string, string>[];
  if (isCsv) {
    rows = parseCsvBuffer(file.buffer);
  } else if (isExcel) {
    rows = await parseExcelBuffer(file.buffer);
  } else {
    throw new BadRequestException('Unsupported file type — upload a .csv, .xls or .xlsx file');
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new BadRequestException(`Too many rows (${rows.length}) — split the file into batches of ${MAX_IMPORT_ROWS} or fewer`);
  }
  return rows;
}
