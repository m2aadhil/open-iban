import { useEffect, useState } from 'react';
import { api } from '../../api/client';

export default function StatusPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api.dataStatus().then(setRows).catch(() => {}); }, []);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Bank data status</h1>
      <table className="w-full text-sm bg-white border border-slate-200 rounded">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">Country</th>
            <th className="text-left p-2">Rows</th>
            <th className="text-left p-2">Last upload</th>
            <th className="text-left p-2">By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.country} className="border-t border-slate-100">
              <td className="p-2 font-mono">{r.country}</td>
              <td className="p-2">{r.rowCount.toLocaleString()}</td>
              <td className="p-2">{r.lastUpload ?? '—'}</td>
              <td className="p-2">{r.uploadedBy ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
