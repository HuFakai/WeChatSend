const base = import.meta.env.VITE_API_BASE ?? '/api/v1';
const TOKEN_KEY = 'wechatsend_token';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      setToken(null);
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    const message = Array.isArray(data.message) ? data.message.join('，') : data.message;
    throw new ApiError(message || '请求失败，请稍后重试', response.status);
  }
  return data as T;
}

export function post<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export function patch<T>(path: string, body: unknown) {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
