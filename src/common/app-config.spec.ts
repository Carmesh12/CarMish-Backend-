import { getCorsOrigin, getJwtExpiresIn, getJwtSecret } from './app-config';

describe('app config smoke checks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.CORS_ORIGIN;
    delete process.env.FRONTEND_URL;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps local development defaults working', () => {
    expect(getCorsOrigin()).toBe('http://localhost:5173');
    expect(getJwtSecret()).toBe('default-dev-secret');
    expect(getJwtExpiresIn()).toBe('1d');
  });

  it('uses CORS_ORIGIN before FRONTEND_URL', () => {
    process.env.FRONTEND_URL = 'https://frontend.example.test';
    process.env.CORS_ORIGIN = 'https://cors.example.test';

    expect(getCorsOrigin()).toBe('https://cors.example.test');
  });

  it('fails clearly when JWT_SECRET is missing in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => getJwtSecret()).toThrow(
      'JWT_SECRET must be set in production.',
    );
  });

  it('fails clearly when CORS origin is missing in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => getCorsOrigin()).toThrow(
      'CORS_ORIGIN or FRONTEND_URL must be set in production.',
    );
  });
});
