import { useState } from 'react';
import { api } from '../api/client';

export default function ValidatePage() {
  const [iban, setIban] = useState('DE89 3704 0044 0532 0130 00');
  const [getBic, setGetBic] = useState(true);
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setResult(null); setBusy(true);
    try {
      const r = await api.validate(iban.replace(/\s+/g, ''), { getBic, validateBankCode: getBic });
      setResult(r);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Validate an IBAN</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
          placeholder="DE89 3704 0044 0532 0130 00"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={getBic} onChange={(e) => setGetBic(e.target.checked)} />
          Lookup BIC / bank details
        </label>
        <button disabled={busy} className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50">
          {busy ? 'Validating…' : 'Validate'}
        </button>
      </form>

      {err && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{err}</div>}

      {result && (
        <div className="mt-6 p-4 bg-white border border-slate-200 rounded">
          <div className={`text-lg font-semibold ${result.valid ? 'text-green-700' : 'text-red-700'}`}>
            {result.valid ? '✓ Valid IBAN' : '✗ Invalid'}
          </div>
          <ul className="mt-2 text-sm space-y-1">
            {result.messages.map((m: string, i: number) => <li key={i}>• {m}</li>)}
          </ul>
          <div className="mt-3 text-sm grid grid-cols-2 gap-2">
            <span>Country:</span><span>{result.checkResults.countryCode ? '✓' : '✗'}</span>
            <span>Length:</span><span>{result.checkResults.length ? '✓' : '✗'}</span>
            <span>Checksum:</span><span>{result.checkResults.checksum ? '✓' : '✗'}</span>
            {'bankCode' in result.checkResults && (
              <><span>Bank code:</span><span>{result.checkResults.bankCode ? '✓' : '✗'}</span></>
            )}
          </div>
          {result.bankData && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-sm text-slate-500">Bank</div>
              <div className="font-mono">{result.bankData.bic}</div>
              <div>{result.bankData.name}</div>
              <div className="text-sm text-slate-500">{result.bankData.zip} {result.bankData.city}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
