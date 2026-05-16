const MAX_MESSAGE_LEN = 2000;

function readStringField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/** Human-readable message from unknown thrown/rejected values (Cloudinary, fetch, etc.). */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message.slice(0, MAX_MESSAGE_LEN);
  }
  if (typeof err === 'string') {
    return err.slice(0, MAX_MESSAGE_LEN);
  }
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const direct =
      readStringField(o, 'message') ??
      readStringField(o, 'error') ??
      readStringField(o, 'error_message');
    if (direct) return direct.slice(0, MAX_MESSAGE_LEN);

    const nested = o.error;
    if (nested && typeof nested === 'object') {
      const nestedMsg = readStringField(nested as Record<string, unknown>, 'message');
      if (nestedMsg) return nestedMsg.slice(0, MAX_MESSAGE_LEN);
    }

    const httpCode = o.http_code ?? o.statusCode;
    if (httpCode != null && direct) {
      return `[${httpCode}] ${direct}`.slice(0, MAX_MESSAGE_LEN);
    }

    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') {
        return json.slice(0, MAX_MESSAGE_LEN);
      }
    } catch {
      /* ignore */
    }
  }
  return String(err).slice(0, MAX_MESSAGE_LEN);
}

export function extractErrorDetails(err: unknown): {
  message: string;
  stack?: string;
  httpCode?: number;
} {
  const message = extractErrorMessage(err);
  const details: { message: string; stack?: string; httpCode?: number } = { message };
  if (err instanceof Error && err.stack) {
    details.stack = err.stack;
  }
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const code = o.http_code ?? o.statusCode;
    if (typeof code === 'number') details.httpCode = code;
  }
  return details;
}

export function urlHostForLog(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid-url)';
  }
}

/** AWS SDK v3 often returns XML parse errors when the endpoint responds with plain text/HTML. */
export function extractAwsS3ErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const response = o.$response as
      | { statusCode?: number; body?: unknown; headers?: Record<string, string> }
      | undefined;
    const status = response?.statusCode;
    const bodyText = readAwsResponseBody(response?.body);
    if (status != null && bodyText) {
      return `HTTP ${status}: ${bodyText}`.slice(0, MAX_MESSAGE_LEN);
    }
    if (bodyText) {
      return bodyText.slice(0, MAX_MESSAGE_LEN);
    }
  }
  return extractErrorMessage(err);
}

function readAwsResponseBody(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === 'string' && body.trim()) {
    return body.trim().slice(0, 500);
  }
  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    const text = Buffer.from(body).toString('utf8').trim();
    return text ? text.slice(0, 500) : null;
  }
  return null;
}

export function supabaseConfigLooksLikePlaceholder(
  supabaseUrl?: string,
  s3Endpoint?: string,
): boolean {
  const haystack = `${supabaseUrl ?? ''} ${s3Endpoint ?? ''}`.toLowerCase();
  return (
    haystack.includes('your_project_ref') ||
    haystack.includes('your-project') ||
    haystack.includes('example.supabase')
  );
}
