// apps/web/src/lib/api/client.ts

// General purpose HTTP client

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(
  method: string,
  path: string,
  options: {
    body?: unknown;
    token?: string;
    params?: Record<string, string>;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const url = new URL(`${API_BASE}${path}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(
      'network_error',
      'Unable to connect. Check your internet connection.',
      0,
    );
  }

  if (!res.ok) {
    let errBody: {
      error: string;
      message: string;
      details?: Record<string, unknown>;
    };
    try {
      errBody = await res.json();
    } catch {
      throw new ApiRequestError(
        'internal_error',
        'Something went wrong. Please try again.',
        res.status,
      );
    }

    throw new ApiRequestError(
      errBody.error,
      errBody.message,
      res.status,
      errBody.details,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, token?: string, params?: Record<string, string>) =>
    request<T>('GET', path, { token, params }),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>('POST', path, { body, token }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>('PATCH', path, { body, token }),
  delete: <T>(path: string, token?: string) => request<T>('DELETE', path, { token }),
};
