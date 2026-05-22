async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  validate: (iban: string, opts: { getBic?: boolean; validateBankCode?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.getBic) params.set('getBIC', 'true');
    if (opts.validateBankCode) params.set('validateBankCode', 'true');
    return request<any>(`/validate/${encodeURIComponent(iban)}?${params.toString()}`);
  },
  calculate: (country: string, bankCode: string, accountNumber: string) =>
    request<{ iban: string; valid: boolean }>(
      `/calculate/${country}/${bankCode}/${accountNumber}`,
    ),
  countries: () => request<any[]>('/countries'),
  login: (username: string, password: string) =>
    request<{ ok: boolean }>('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/admin/logout', { method: 'POST' }),
  me: () => request<{ username: string }>('/admin/me'),
  dataStatus: () => request<any[]>('/admin/data/status'),
  audit: (action?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action) params.set('action', action);
    return request<{ entries: any[]; total: number }>(`/admin/audit?${params.toString()}`);
  },
  uploadData: async (country: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/admin/data/${country}`, { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json();
  },
  previewUpload: async (country: string, file: File, isCustom = false) => {
    const fd = new FormData();
    fd.append('file', file);
    const url = isCustom
      ? `/admin/data/preview/custom?country=${encodeURIComponent(country)}`
      : `/admin/data/preview/${encodeURIComponent(country)}`;
    const res = await fetch(url, { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json();
  },
  ingestUpload: (uploadId: string, mapping?: Record<string, string | undefined>) =>
    request<any>('/admin/data/ingest', { method: 'POST', body: JSON.stringify({ uploadId, mapping }) }),
};
