import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

type TripoEnvelope<T> = { code?: number; data?: T; message?: string };

@Injectable()
export class TripoHttpService {
  private readonly logger = new Logger(TripoHttpService.name);

  get baseUrl(): string {
    const raw = process.env.TRIPO_API_BASE_URL?.trim();
    return (raw && raw.length > 0 ? raw : 'https://api.tripo3d.ai/v2/openapi').replace(
      /\/$/,
      '',
    );
  }

  get apiKey(): string {
    const k = process.env.TRIPO_API_KEY?.trim();
    if (!k) {
      throw new ServiceUnavailableException('Tripo API is not configured');
    }
    return k;
  }

  isConfigured(): boolean {
    return Boolean(process.env.TRIPO_API_KEY?.trim());
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson<T>('POST', path, { body: JSON.stringify(body) });
  }

  async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>('GET', path);
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    path: string,
    init?: { body?: string },
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, { method, headers, body: init?.body });
    const traceId = res.headers.get('x-tripo-trace-id') ?? res.headers.get('X-Tripo-Trace-ID');

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = {};
    }

    if (!res.ok) {
      const msg =
        typeof parsed === 'object' &&
        parsed &&
        'message' in parsed &&
        typeof (parsed as { message: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : res.statusText;
      this.logger.warn(
        `Tripo HTTP ${method} ${path} failed status=${res.status} trace=${traceId ?? 'n/a'} message=${msg}`,
      );
      const err = new Error(`Tripo request failed: ${msg}`) as Error & {
        status: number;
        traceId?: string;
      };
      err.status = res.status;
      err.traceId = traceId ?? undefined;
      throw err;
    }

    const env = parsed as TripoEnvelope<T> & { code?: number };
    if (env && typeof env === 'object' && 'code' in env && env.code !== undefined && env.code !== 0) {
      const msg =
        typeof env.message === 'string'
          ? env.message
          : `Tripo API error code=${env.code}`;
      this.logger.warn(
        `Tripo business error ${method} ${path} trace=${traceId ?? 'n/a'} message=${msg}`,
      );
      const err = new Error(msg) as Error & { status: number; traceId?: string };
      err.status = res.status;
      err.traceId = traceId ?? undefined;
      throw err;
    }

    if (env && typeof env === 'object' && 'data' in env && env.data !== undefined) {
      if (traceId) {
        this.logger.debug(`Tripo trace=${traceId} ${method} ${path}`);
      }
      return env.data as T;
    }

    if (traceId) {
      this.logger.debug(`Tripo trace=${traceId} ${method} ${path}`);
    }
    return parsed as T;
  }
}
