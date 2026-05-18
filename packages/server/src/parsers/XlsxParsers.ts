import ExcelJS from 'exceljs';
import type { BankInfo } from '@open-iban/shared';
import type { BankDataParser } from './types.js';

/**
 * Generic XLSX parser factory. Reads the first worksheet and yields BankInfo rows
 * by mapping configurable column header names.
 */
export interface XlsxColumnMap {
  bankCode: string[];
  name?: string[];
  bic?: string[];
  zip?: string[];
  city?: string[];
}

export function createXlsxParser(opts: {
  country: string;
  source: string;
  columns: XlsxColumnMap;
}): BankDataParser {
  return {
    country: opts.country,
    source: opts.source,
    extensions: ['.xlsx', '.xls'],

    async *parse(buffer: Buffer): AsyncIterable<BankInfo> {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) return;

      // Find header row (the first row with text values).
      const headerRow = ws.getRow(1);
      const headers: Record<number, string> = {};
      headerRow.eachCell((cell, col) => {
        headers[col] = String(cell.value ?? '').trim();
      });

      const findCol = (candidates: string[] | undefined): number | undefined => {
        if (!candidates) return undefined;
        for (const [col, h] of Object.entries(headers)) {
          if (candidates.some((c) => h.toLowerCase() === c.toLowerCase())) return Number(col);
        }
        return undefined;
      };

      const cBank = findCol(opts.columns.bankCode);
      const cName = findCol(opts.columns.name);
      const cBic = findCol(opts.columns.bic);
      const cZip = findCol(opts.columns.zip);
      const cCity = findCol(opts.columns.city);
      if (!cBank) throw new Error(`Cannot find bank-code column in ${opts.source} file`);

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
          country: opts.country,
          bankCode,
          name: cellStr(row, cName),
          bic: cellStr(row, cBic),
          zip: cellStr(row, cZip),
          city: cellStr(row, cCity),
        });
      });
      for (const r of rows) yield r;
    },
  };
}

export const BelgiumParser = createXlsxParser({
  country: 'BE',
  source: 'nbb',
  columns: {
    bankCode: ['Bank Identification Number', 'BIN', 'Banknummer'],
    name: ['Institution', 'Naam', 'Nom'],
    bic: ['BIC', 'SWIFT'],
  },
});

export const NetherlandsParser = createXlsxParser({
  country: 'NL',
  source: 'nl-banken',
  columns: {
    bankCode: ['Identifier', 'Bank Identifier', 'Code'],
    name: ['Name', 'Naam'],
    bic: ['BIC'],
  },
});

export const SwitzerlandParser = createXlsxParser({
  country: 'CH',
  source: 'snb',
  columns: {
    bankCode: ['IID (BC-Nr.)', 'IID', 'BC-Nr.', 'BCNumber'],
    name: ['Bezeichnung', 'Institutsname', 'Name'],
    bic: ['SIC', 'BIC', 'SwiftBic'],
    zip: ['PLZ', 'Postcode'],
    city: ['Domizil', 'Ort', 'PlaceName'],
  },
});

export const LuxembourgParser = createXlsxParser({
  country: 'LU',
  source: 'bcl',
  columns: {
    bankCode: ['Bank code', 'BankCode', 'Code'],
    name: ['Name', 'Institution'],
    bic: ['BIC', 'SWIFT'],
  },
});

export const LiechtensteinParser = createXlsxParser({
  country: 'LI',
  source: 'fma',
  columns: {
    bankCode: ['Bank Code', 'BankCode', 'Code'],
    name: ['Name', 'Institut'],
    bic: ['BIC', 'SWIFT'],
  },
});
