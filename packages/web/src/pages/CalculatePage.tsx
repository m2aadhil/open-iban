import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function CalculatePage() {
  const [country, setCountry] = useState('DE');
  const [bankCode, setBankCode] = useState('37040044');
  const [account, setAccount] = useState('0532013000');
  const [countries, setCountries] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.countries().then((c) => setCountries(c.filter((x: any) => x.hasBankData))).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setResult(null);
    try {
      const r = await api.calculate(country, bankCode, account);
      setResult(r);
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Calculate an IBAN</h1>
      <form onSubmit={submit} className="space-y-3">
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="px-3 py-2 border border-slate-300 rounded">
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.code} (bank code: {c.bankCodeLength} chars)</option>
          ))}
        </select>
        <input value={bankCode} onChange={(e) => setBankCode(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded font-mono" placeholder="Bank code" />
        <input value={account} onChange={(e) => setAccount(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded font-mono" placeholder="Account number" />
        <button className="px-4 py-2 bg-slate-900 text-white rounded">Calculate</button>
      </form>
      {err && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{err}</div>}
      {result && (
        <div className="mt-6 p-4 bg-white border rounded">
          <div className="text-sm text-slate-500">IBAN</div>
          <div className="font-mono text-lg">{result.iban}</div>
          <div className={result.valid ? 'text-green-700' : 'text-red-700'}>
            {result.valid ? '✓ Valid' : '✗ Invalid'}
          </div>
        </div>
      )}
    </div>
  );
}
