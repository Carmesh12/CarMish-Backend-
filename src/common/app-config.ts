const DEFAULT_DEV_FRONTEND_URL = 'http://localhost:5173';
const DEFAULT_DEV_JWT_SECRET = 'default-dev-secret';
const DEFAULT_JWT_EXPIRES_IN = '1d';

type CorsOrigin = string | string[];

type JwtExpiresIn =
  | number
  | `${number}ms`
  | `${number}s`
  | `${number}m`
  | `${number}h`
  | `${number}d`
  | `${number}w`
  | `${number}y`;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function parseCorsOrigins(rawOrigin: string | undefined): CorsOrigin | null {
  const origins = (rawOrigin ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    return null;
  }

  return origins.length === 1 ? origins[0] : origins;
}

export function getCorsOrigin(): CorsOrigin {
  const corsOrigin = parseCorsOrigins(process.env.CORS_ORIGIN);
  if (corsOrigin) return corsOrigin;

  const frontendOrigin = parseCorsOrigins(process.env.FRONTEND_URL);
  if (frontendOrigin) return frontendOrigin;

  if (isProduction()) {
    throw new Error('CORS_ORIGIN or FRONTEND_URL must be set in production.');
  }

  return DEFAULT_DEV_FRONTEND_URL;
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret) {
    return secret;
  }

  if (isProduction()) {
    throw new Error('JWT_SECRET must be set in production.');
  }

  return DEFAULT_DEV_JWT_SECRET;
}

export function getJwtExpiresIn(): JwtExpiresIn {
  return (process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN) as JwtExpiresIn;
}
