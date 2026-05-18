import { useEffect, useState } from 'react';
import { api } from '../../api/client';

export default function AuditLogPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    api.audit(action || undefined, limit, offset).then((r) => { setEntries(r.entries); setTotal(r.total); }).catch(() => {});
  }, [action, offset]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Audit log</h1>
      <div className="flex items-center gap-3 mb-3 text-sm">
        <label>Filter action:</label>
        <select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} className="px-2 py-1 border border-slate-300 rounded">
          <option value="">All</option>
          <option value="validate">validate</option>
          <option value="calculate">calculate</option>
          <option value="upload">upload</option>
          <option value="upload.failed">upload.failed</option>
          <option value="login">login</option>
          <option value="login.failed">login.failed</option>
        </select>
        <span className="text-slate-500">Total: {total}</span>
      </div>
      <table className="w-full text-xs bg-white border border-slate-200 rounded">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">Time</th>
            <th className="text-left p-2">Actor</th>
            <th className="text-left p-2">Action</th>
            <th className="text-left p-2">Target</th>
            <th className="text-left p-2">IP</th>
            <th className="text-left p-2">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-slate-100 align-top">
              <td className="p-2 font-mono">{e.ts}</td>
              <td className="p-2">{e.actor}</td>
              <td className="p-2">{e.action}</td>
              <td className="p-2 font-mono">{e.target ?? '—'}</td>
              <td className="p-2">{e.ip ?? '—'}</td>
              <td className="p-2 font-mono text-slate-500">{e.metadata ? JSON.stringify(e.metadata) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-2 text-sm">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-2 py-1 border border-slate-300 rounded disabled:opacity-50">Prev</button>
        <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-2 py-1 border border-slate-300 rounded disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}
