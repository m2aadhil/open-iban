import { useState } from 'react';
import { api } from '../../api/client';

const COUNTRIES = [
  { code: 'DE', label: 'Germany (Bundesbank .txt)', accept: '.txt' },
  { code: 'AT', label: 'Austria (OeNB .csv)', accept: '.csv' },
  { code: 'BE', label: 'Belgium (NBB .xlsx)', accept: '.xlsx,.xls' },
  { code: 'NL', label: 'Netherlands (.xlsx)', accept: '.xlsx,.xls' },
  { code: 'CH', label: 'Switzerland (SNB .xlsx)', accept: '.xlsx,.xls' },
  { code: 'LU', label: 'Luxembourg (BCL .xlsx)', accept: '.xlsx,.xls' },
  { code: 'LI', label: 'Liechtenstein (FMA .xlsx)', accept: '.xlsx,.xls' },
  { code: 'CUSTOM', label: 'Custom CSV/XLSX (other country)', accept: '.csv,.xlsx,.xls' },
];

const FIELDS = [
  { key: 'bankCode', label: 'bankCode *', required: true },
  { key: 'name', label: 'name', required: false },
  { key: 'bic', label: 'bic', required: false },
  { key: 'zip', label: 'zip', required: false },
  { key: 'city', label: 'city', required: false },
] as const;

interface Preview {
  uploadId: string;
  country: string;
  format: 'csv' | 'xlsx' | 'fixed-width';
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping?: Record<string, string | undefined>;
  source: string;
  filename: string;
}

export default function DataUploadPage() {
  const [country, setCountry] = useState('DE');
  const [customCC, setCustomCC] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const isCustom = country === 'CUSTOM';

  const reset = () => {
    setPreview(null);
    setMapping({});
    setResult(null);
    setErr('');
    setFile(null);
  };

  const startPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setErr(''); setResult(null); setBusy(true);
    try {
      const cc = isCustom ? customCC.toUpperCase() : country;
      if (isCustom && !/^[A-Z]{2}$/.test(cc)) throw new Error('Country code must be 2 letters');
      const p: Preview = await api.previewUpload(cc, file, isCustom);
      setPreview(p);
      const init: Record<string, string> = {};
      for (const f of FIELDS) {
        const sug = p.suggestedMapping?.[f.key];
        if (sug && p.headers.includes(sug)) init[f.key] = sug;
        else init[f.key] = '';
      }
      setMapping(init);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const confirmIngest = async () => {
    if (!preview) return;
    setErr(''); setBusy(true);
    try {
      const payload: Record<string, string> = { bankCode: mapping.bankCode };
      for (const f of FIELDS) {
        if (!f.required && mapping[f.key]) payload[f.key] = mapping[f.key];
      }
      const mappingArg = preview.format === 'fixed-width' ? undefined : payload;
      const r = await api.ingestUpload(preview.uploadId, mappingArg);
      setResult(r);
      setPreview(null);
      setMapping({});
      setFile(null);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const accept = isCustom ? '.csv,.xlsx,.xls' : COUNTRIES.find((c) => c.code === country)?.accept ?? '';
  const canConfirm = !!preview && (preview.format === 'fixed-width' || !!mapping.bankCode);

  if (preview) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Confirm import — {preview.country}</h1>
        <p className="text-sm text-slate-600 mb-4">
          File: <b>{preview.filename}</b> · format: {preview.format} · source: {preview.source}
        </p>

        {preview.format !== 'fixed-width' && (
          <div className="mb-4">
            <h2 className="font-semibold mb-2">Map columns</h2>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col text-sm">
                  <span className="mb-1">{f.label}</span>
                  <select
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded"
                  >
                    {!f.required && <option value="">(none)</option>}
                    {f.required && <option value="">— choose column —</option>}
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        <h2 className="font-semibold mb-2">Sample rows</h2>
        <div className="overflow-auto border border-slate-200 rounded mb-4">
          <table className="text-sm w-full">
            <thead className="bg-slate-50">
              <tr>{preview.headers.map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row, i) => (
                <tr key={i} className="border-t border-slate-200">
                  {preview.headers.map((h) => <td key={h} className="px-2 py-1">{row[h] ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{err}</div>}

        <div className="flex gap-2">
          <button
            disabled={!canConfirm || busy}
            onClick={confirmIngest}
            className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Confirm import'}
          </button>
          <button onClick={reset} className="px-4 py-2 border border-slate-300 rounded">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Upload bank register data</h1>
      <p className="text-sm text-slate-600 mb-4">
        Upload a file to preview detected columns and sample rows. Confirm the mapping to
        atomically replace all rows for the selected source.
      </p>
      <form onSubmit={startPreview} className="space-y-3">
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); setFile(null); }}
          className="px-3 py-2 border border-slate-300 rounded w-full"
        >
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        {isCustom && (
          <input
            type="text"
            placeholder="Country code (ISO 2 letters, e.g. FR)"
            value={customCC}
            onChange={(e) => setCustomCC(e.target.value.toUpperCase().slice(0, 2))}
            className="px-3 py-2 border border-slate-300 rounded w-full"
          />
        )}
        <input
          type="file"
          accept={accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
        <button
          disabled={!file || busy || (isCustom && customCC.length !== 2)}
          className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50"
        >
          {busy ? 'Previewing…' : 'Preview'}
        </button>
      </form>
      {err && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{err}</div>}
      {result && (
        <div className="mt-4 p-3 bg-green-50 text-green-800 rounded">
          Imported <b>{result.rowCount}</b> rows for {result.country} in {result.durationMs} ms.
        </div>
      )}
    </div>
  );
}
