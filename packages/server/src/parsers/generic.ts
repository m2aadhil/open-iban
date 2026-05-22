import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import iconv from 'iconv-lite';
import type { BankInfo, ColumnMapping } from '@open-iban/shared';

const SAMPLE_ROW_COUNT = 5;

function decodeCsv(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  return iconv.decode(buf, 'ISO-8859-1');
}

function parseCsvRecords(buf: Buffer): Record<string, string>[] {
  const text = decodeCsv(buf);
  const delimiter = text.includes(';') && text.indexOf(';') < text.indexOf('\n') ? ';' : ',';
  return parseCsv(text, {
    columns: true,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
}

export function readCsvHeaders(buf: Buffer): { headers: string[]; sampleRows: Record<string, string>[] } {
  const records = parseCsvRecords(buf);
  const headers = records.length > 0 ? Object.keys(records[0]!) : [];
  return { headers, sampleRows: records.slice(0, SAMPLE_ROW_COUNT) };
}

export async function readXlsxHeaders(
  buf: Buffer,
): Promise<{ headers: string[]; sampleRows: Record<string, string>[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], sampleRows: [] };

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  const colToHeader: Record<number, string> = {};
  headerRow.eachCell((cell, col) => {
    const h = String(cell.value ?? '').trim();
    headers.push(h);
    colToHeader[col] = h;
  });

  const sampleRows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (sampleRows.length >= SAMPLE_ROW_COUNT) return;
    const obj: Record<string, string> = {};
    for (const [colStr, header] of Object.entries(colToHeader)) {
      const col = Number(colStr);
      const v = row.getCell(col).value;
      obj[header] = v == null ? '' : String(typeof v === 'object' && 'text' in v ? v.text : v).trim();
    }
    sampleRows.push(obj);
  });
  return { headers, sampleRows };
}

function pick(row: Record<string, string>, header: string | undefined): string | undefined {
  if (!header) return undefined;
  const v = row[header];
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export async function* parseCsvWithMapping(
  buf: Buffer,
  country: string,
  mapping: ColumnMapping,
): AsyncIterable<BankInfo> {
  const records = parseCsvRecords(buf);
  for (const row of records) {
    const bankCode = pick(row, mapping.bankCode);
    if (!bankCode) continue;
    yield {
      country,
      bankCode,
      name: pick(row, mapping.name),
      bic: pick(row, mapping.bic),
      zip: pick(row, mapping.zip),
      city: pick(row, mapping.city),
    };
  }
}

export async function* parseXlsxWithMapping(
  buf: Buffer,
  country: string,
  mapping: ColumnMapping,
): AsyncIterable<BankInfo> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const headerRow = ws.getRow(1);
  const headerToCol: Record<string, number> = {};
  headerRow.eachCell((cell, col) => {
    const h = String(cell.value ?? '').trim();
    if (h) headerToCol[h] = col;
  });

  const cBank = headerToCol[mapping.bankCode];
  if (!cBank) throw new Error(`Cannot find column "${mapping.bankCode}" in uploaded file`);
  const cName = mapping.name ? headerToCol[mapping.name] : undefined;
  const cBic = mapping.bic ? headerToCol[mapping.bic] : undefined;
  const cZip = mapping.zip ? headerToCol[mapping.zip] : undefined;
  const cCity = mapping.city ? headerToCol[mapping.city] : undefined;

  const cellStr = (row: ExcelJS.Row, col: number | undefined): string | undefined => {
    if (!col) return undefined;
    const v = row.getCell(col).value;
    if (v == null) return undefined;
    const s = String(typeof v === 'object' && 'text' in v ? v.text : v).trim();
    return s || undefined;
  };

  const rows: BankInfo[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const bankCode = cellStr(row, cBank);
    if (!bankCode) return;
    rows.push({
      country,
      bankCode,
      name: cellStr(row, cName),
      bic: cellStr(row, cBic),
      zip: cellStr(row, cZip),
      city: cellStr(row, cCity),
    });
  });
  for (const r of rows) yield r;
}
