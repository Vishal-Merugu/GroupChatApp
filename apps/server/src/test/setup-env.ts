/**
 * Runs before any test module is imported, so `getEnv()` sees a valid config
 * whichever module happens to load first.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_KEY = 'test-secret-key-that-is-long-enough';
process.env.JWT_EXPIRES_IN = '1h';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.LOG_LEVEL = 'error';
// A fixed (non-secret) 32-byte key — fine for tests, never for a real deploy.
process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
