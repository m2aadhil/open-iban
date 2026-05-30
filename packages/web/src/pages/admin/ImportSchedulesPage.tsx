import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface ImportSource {
  id: number;
  country: string;
  source: string;
  url: string;
  format: 'csv' | 'xlsx' | 'fixed-width';
  mapping?: Record<string, string>;
  bankCodeStart?: number;
  bankCodeLength?: number;
  schedule?: string;
  enabled: boolean;
  lastRunAt?: string;
  lastStatus?: 'success' | 'failed';
  lastError?: string;
  lastRowCount?: number;
}

const FIELDS = ['bankCode', 'name', 'bic', 'zip', 'city'] as const;

interface FormState {
  id?: number;
  country: string;
  source: string;
  url: string;
  format: 'csv' | 'xlsx' | 'fixed-width';
  mapping: Record<string, string>;
  bankCodeStart: string;
  bankCodeLength: string;
  schedule: string;
  enabled: boolean;
}

const emptyForm = (): FormState => ({
  country: '',
  source: '',
  url: '',
  format: 'csv',
  mapping: { bankCode: '' },
  bankCodeStart: '',
  bankCodeLength: '',
  schedule: '',
  enabled: true,
});

export default function ImportSchedulesPage() {
  const [items, setItems] = useState<ImportSource[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try { setItems(await api.listImports()); } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { void load(); }, []);

  const startCreate = () => { setErr(''); setMsg(''); setForm(emptyForm()); };
  const startEdit = (s: ImportSource) => {
    setErr(''); setMsg('');
    setForm({
      id: s.id,
      country: s.country,
      source: s.source,
      url: s.url,
      format: s.format,
      mapping: { bankCode: '', ...(s.mapping ?? {}) },
      bankCodeStart: s.bankCodeStart != null ? String(s.bankCodeStart) : '',
      bankCodeLength: s.bankCodeLength != null ? String(s.bankCodeLength) : '',
      schedule: s.schedule ?? '',
      enabled: s.enabled,
    });
  };

  const save = async () => {
    if (!form) return;
    setErr(''); setBusy(true);
    try {
      const payload: any = {
        country: form.country.toUpperCase(),
        source: form.source,
        url: form.url,
        format: form.format,
        enabled: form.enabled,
      };
      if (form.format !== 'fixed-width') {
        const m: Record<string, string> = { bankCode: form.mapping.bankCode };
        for (const f of FIELDS) {
          if (f !== 'bankCode' && form.mapping[f]) m[f] = form.mapping[f];
        }
        payload.mapping = m;
      }
      if (form.bankCodeStart) payload.bankCodeStart = Number(form.bankCodeStart);
      if (form.bankCodeLength) payload.bankCodeLength = Number(form.bankCodeLength);
      if (form.schedule) payload.schedule = form.schedule;
      if (form.id) await api.updateImport(form.id, payload);
      else await api.createImport(payload);
      setForm(null);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const runNow = async (id: number) => {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const r = await api.runImport(id);
      setMsg(`Ran #${id}: ${r.rowCount} rows in ${r.durationMs} ms`);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm(`Delete import source #${id}?`)) return;
    setErr(''); setBusy(true);
    try { await api.deleteImport(id); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (form) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">{form.id ? 'Edit' : 'New'} import source</h1>
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{err}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-sm">
              <span className="mb-1">Country (ISO 2)</span>
              <input className="px-3 py-2 border border-slate-300 rounded" maxLength={2}
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
            </label>
            <label className="flex flex-col text-sm">
              <span className="mb-1">Source key (unique)</span>
              <input className="px-3 py-2 border border-slate-300 rounded"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </label>
          </div>
          <label className="flex flex-col text-sm">
            <span className="mb-1">URL</span>
            <input className="px-3 py-2 border border-slate-300 rounded"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col text-sm">
              <span className="mb-1">Format</span>
              <select className="px-3 py-2 border border-slate-300 rounded"
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as any })}>
                <option value="csv">csv</option>
                <option value="xlsx">xlsx</option>
                <option value="fixed-width">fixed-width</option>
              </select>
            </label>
            <label className="flex flex-col text-sm">
              <span className="mb-1">Bank code start (IBAN index)</span>
              <input className="px-3 py-2 border border-slate-300 rounded" placeholder="e.g. 4"
                value={form.bankCodeStart}
                onChange={(e) => setForm({ ...form, bankCodeStart: e.target.value })} />
            </label>
            <label className="flex flex-col text-sm">
              <span className="mb-1">Bank code length</span>
              <input className="px-3 py-2 border border-slate-300 rounded" placeholder="e.g. 5"
                value={form.bankCodeLength}
                onChange={(e) => setForm({ ...form, bankCodeLength: e.target.value })} />
            </label>
          </div>
          {form.format !== 'fixed-width' && (
            <div>
              <div className="text-sm font-semibold mb-1">Column mapping (target → source column name)</div>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS.map((f) => (
                  <label key={f} className="flex flex-col text-sm">
                    <span className="mb-1">{f}{f === 'bankCode' ? ' *' : ''}</span>
                    <input className="px-3 py-2 border border-slate-300 rounded"
                      value={form.mapping[f] ?? ''}
                      onChange={(e) => setForm({ ...form, mapping: { ...form.mapping, [f]: e.target.value } })} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="flex flex-col text-sm">
            <span className="mb-1">Cron schedule (leave blank for manual-only)</span>
            <input className="px-3 py-2 border border-slate-300 rounded" placeholder="0 3 * * *"
              value={form.schedule}
              onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
            <span className="text-xs text-slate-500 mt-1">
              5-field cron. <a className="underline" href="https://crontab.guru" target="_blank" rel="noreferrer">crontab.guru</a>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enabled
          </label>
          <div className="flex gap-2">
            <button disabled={busy} onClick={save}
              className="px-4 py-2 bg-slate-900 text-white rounded disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2 border border-slate-300 rounded">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Scheduled imports</h1>
        <button onClick={startCreate} className="px-4 py-2 bg-slate-900 text-white rounded">New source</button>
      </div>
      {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded">{err}</div>}
      {msg && <div className="mb-3 p-3 bg-green-50 text-green-800 rounded">{msg}</div>}
      <div className="overflow-auto border border-slate-200 rounded">
        <table className="text-sm w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left">Country</th>
              <th className="px-2 py-2 text-left">Source</th>
              <th className="px-2 py-2 text-left">URL</th>
              <th className="px-2 py-2 text-left">Schedule</th>
              <th className="px-2 py-2 text-left">Enabled</th>
              <th className="px-2 py-2 text-left">Last run</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Rows</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t border-slate-200">
                <td className="px-2 py-2">{s.country}</td>
                <td className="px-2 py-2">{s.source}</td>
                <td className="px-2 py-2 max-w-xs truncate" title={s.url}>{s.url}</td>
                <td className="px-2 py-2 font-mono text-xs">{s.schedule ?? '—'}</td>
                <td className="px-2 py-2">{s.enabled ? 'yes' : 'no'}</td>
                <td className="px-2 py-2">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—'}</td>
                <td className="px-2 py-2">
                  {s.lastStatus === 'failed' ? (
                    <span className="text-red-700" title={s.lastError}>failed</span>
                  ) : s.lastStatus === 'success' ? (
                    <span className="text-green-700">success</span>
                  ) : '—'}
                </td>
                <td className="px-2 py-2">{s.lastRowCount ?? '—'}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <button disabled={busy} onClick={() => runNow(s.id)} className="text-blue-700 hover:underline mr-2">Run</button>
                  <button onClick={() => startEdit(s)} className="text-slate-700 hover:underline mr-2">Edit</button>
                  <button disabled={busy} onClick={() => remove(s.id)} className="text-red-700 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-slate-500">No import sources configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
