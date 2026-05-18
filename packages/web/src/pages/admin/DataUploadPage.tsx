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
];

export default function DataUploadPage() {
  const [country, setCountry] = useState('DE');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setErr(''); setResult(null); setBusy(true);
    try {
      const r = await api.uploadData(country, file);
      setResult(r);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const accept = COUNTRIES.find((c) => c.code === country)?.accept ?? '';

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Upload bank register data</h1>
      <p className="text-sm text-slate-600 mb-4">
        Replaces all bank-code rows for the selected country with rows parsed from the uploaded file.
        The previous data is removed atomically inside a single transaction.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <select value={country} onChange={(e) => { setCountry(e.target.value); setFile(null); }} className="px-3 py-2 border border-slate-300 rounded w-full">
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <input
          type="file"
          accept={accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
        <button disabled={!file || busy} className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50">
          {busy ? 'Uploading…' : 'Upload'}
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
