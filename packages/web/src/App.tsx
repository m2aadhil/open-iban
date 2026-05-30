import { Link, Route, Routes, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ValidatePage from './pages/ValidatePage';
import CalculatePage from './pages/CalculatePage';
import LoginPage from './pages/LoginPage';
import DataUploadPage from './pages/admin/DataUploadPage';
import StatusPage from './pages/admin/StatusPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import ImportSchedulesPage from './pages/admin/ImportSchedulesPage';
import { api } from './api/client';

function Nav({ user, onLogout }: { user: string | null; onLogout: () => void }) {
  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-6 text-sm">
        <Link to="/" className="font-bold text-lg text-slate-900">open-iban</Link>
        <Link to="/" className="text-slate-600 hover:text-slate-900">Validate</Link>
        <Link to="/calculate" className="text-slate-600 hover:text-slate-900">Calculate</Link>
        <div className="flex-1" />
        {user ? (
          <>
            <Link to="/admin" className="text-slate-600 hover:text-slate-900">Upload</Link>
            <Link to="/admin/imports" className="text-slate-600 hover:text-slate-900">Schedules</Link>
            <Link to="/admin/status" className="text-slate-600 hover:text-slate-900">Status</Link>
            <Link to="/admin/audit" className="text-slate-600 hover:text-slate-900">Audit</Link>
            <span className="text-slate-400">{user}</span>
            <button onClick={onLogout} className="text-slate-600 hover:text-red-600">Logout</button>
          </>
        ) : (
          <Link to="/login" className="text-slate-600 hover:text-slate-900">Admin</Link>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then((m) => setUser(m.username)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  if (loading) return null;

  const RequireAuth = ({ children }: { children: JSX.Element }) =>
    user ? children : <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen">
      <Nav user={user} onLogout={logout} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<ValidatePage />} />
          <Route path="/calculate" element={<CalculatePage />} />
          <Route path="/login" element={<LoginPage onLogin={setUser} />} />
          <Route path="/admin" element={<RequireAuth><DataUploadPage /></RequireAuth>} />
          <Route path="/admin/imports" element={<RequireAuth><ImportSchedulesPage /></RequireAuth>} />
          <Route path="/admin/status" element={<RequireAuth><StatusPage /></RequireAuth>} />
          <Route path="/admin/audit" element={<RequireAuth><AuditLogPage /></RequireAuth>} />
        </Routes>
      </main>
    </div>
  );
}
