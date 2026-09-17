import "dotenv/config";
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;
await import("../tests/api.test.mjs");
