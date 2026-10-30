export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}

export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Cannot reach the API. Check that it is running.');
  }

  if (!res.ok) {
    // Nest error bodies look like { message: string | string[], statusCode }.
    const data: { message?: string | string[] } | null = await res.json().catch(() => null);
    const raw = data?.message;
    throw new ApiError(Array.isArray(raw) ? raw.join(', ') : (raw ?? `Request failed (${res.status})`));
  }
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
