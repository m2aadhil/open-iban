import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function LoginPage({ onLogin }: { onLogin: (u: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api.login(username, password);
      onLogin(username);
      nav('/admin');
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin login</h1>
      <form onSubmit={submit} className="space-y-3">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="w-full px-3 py-2 border border-slate-300 rounded" autoComplete="username" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full px-3 py-2 border border-slate-300 rounded" autoComplete="current-password" />
        <button className="w-full px-4 py-2 bg-slate-900 text-white rounded">Sign in</button>
      </form>
      {err && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{err}</div>}
    </div>
  );
}
