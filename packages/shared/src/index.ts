export type SupportedCountry = 'DE' | 'AT' | 'BE' | 'NL' | 'CH' | 'LU' | 'LI';

export const SUPPORTED_COUNTRIES: SupportedCountry[] = ['DE', 'AT', 'BE', 'NL', 'CH', 'LU', 'LI'];

export interface BankInfo {
  country: string;
  bankCode: string;
  name?: string;
  bic?: string;
  zip?: string;
  city?: string;
  source?: string;
}

export interface ValidationResult {
  valid: boolean;
  messages: string[];
  iban: string;
  bankData?: BankInfo;
  checkResults: {
    length: boolean;
    countryCode: boolean;
    checksum: boolean;
    bankCode?: boolean;
  };
}

export interface CalculateResult {
  iban: string;
  valid: boolean;
}

export interface CountryInfo {
  code: string;
  length: number;
  bankCodeLength?: number;
  hasBankData: boolean;
}

export interface DataStatus {
  country: string;
  lastUpload?: string;
  rowCount: number;
  source?: string;
  uploadedBy?: string;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  target?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UploadResult {
  country: string;
  filename: string;
  rowCount: number;
  durationMs: number;
}

export interface ColumnMapping {
  bankCode: string;
  name?: string;
  bic?: string;
  zip?: string;
  city?: string;
}

export type UploadFormat = 'csv' | 'xlsx' | 'fixed-width';

export interface UploadPreview {
  uploadId: string;
  country: string;
  format: UploadFormat;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping?: ColumnMapping;
  source: string;
  filename: string;
}

export interface ImportSource {
  id: number;
  country: string;
  source: string;
  url: string;
  format: UploadFormat;
  mapping?: ColumnMapping;
  bankCodeStart?: number;
  bankCodeLength?: number;
  schedule?: string;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus?: 'success' | 'failed';
  lastError?: string;
  lastRowCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportSourceInput {
  country: string;
  source: string;
  url: string;
  format: UploadFormat;
  mapping?: ColumnMapping;
  bankCodeStart?: number;
  bankCodeLength?: number;
  schedule?: string;
  enabled?: boolean;
}
