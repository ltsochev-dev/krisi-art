// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'

/**
 * Integration tests create real Media documents, and `.env` normally points at
 * the live S3 bucket. Clearing the bucket name before `payload.config.ts` is
 * imported makes the storage plugin drop out, so test uploads stay on local disk
 * instead of writing objects into the deployed bucket.
 *
 * Setup files run before test modules are imported, which is what makes this
 * work — the config reads `S3_BUCKET` at module evaluation time.
 */
delete process.env.S3_BUCKET
