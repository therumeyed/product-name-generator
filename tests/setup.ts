// Tests wipe data: point them at a throwaway DB. CI just sets DATABASE_URL to its own empty service DB.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL ??= "postgresql://png:png@localhost:5432/png_test";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.PROVIDER_MODE = "mock";
