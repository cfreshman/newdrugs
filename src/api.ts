export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error?.message || 'Could not connect. Please try again.', body.error?.code || 'unknown', response.status);
  return body as T;
}
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body || {}) });
export async function operation<T>(name: string, input: unknown = {}, options: { confirmed?: boolean; key?: string; signal?: AbortSignal } = {}) {
  const result = await api<{ data: T }>(`/operations/${name}`, { method: 'POST', body: JSON.stringify(input), signal: options.signal, headers: { 'Idempotency-Key': options.key || crypto.randomUUID(), ...(options.confirmed ? { 'X-NewDrugs-Confirmed': 'true' } : {}) } });
  return result.data;
}
export const money = (nanos: number, detail = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: detail ? 4 : 2, maximumFractionDigits: detail ? 6 : 2 }).format(nanos / 1e9);
export const balanceLabel = (nanos: number) => money((Math.ceil(nanos / 10_000_000) || 0) * 10_000_000);
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
