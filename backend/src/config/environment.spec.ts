import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment.js';

describe('environment validation', () => {
  it('accepts a MongoDB URI and a sufficiently long non-placeholder secret', () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/saas_growth_engine',
      JWT_SECRET: 'a-random-test-secret-with-more-than-32-characters',
    });

    expect(config.MONGODB_URI).toContain('mongodb://');
    expect(config.JWT_REFRESH_DAYS).toBe(7);
  });

  it('rejects sample secrets and non-TLS MongoDB connections in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://database.internal/saas_growth_engine',
        JWT_SECRET: 'replace-with-a-unique-random-secret-at-least-32-characters',
        FRONTEND_URL: 'https://app.example.com',
      }),
    ).toThrow('Invalid environment configuration');
  });
});
