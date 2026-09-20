/**
 * Adds `commissions.layout` and `commissions.slug` — the two columns that let a
 * commission be a private photo album instead of a file delivery.
 *
 * Neither changes anything about access. A commission is still gated by its
 * `enabled` flag, its optional expiry and its optional password, and its files
 * still live in a bucket with public access blocked. `layout` decides what the
 * public page draws; `slug` gives it a second, friendlier address.
 *
 * `layout` defaults to `'files'` and is backfilled by that default, so every
 * existing commission keeps rendering exactly as it did.
 *
 * `slug` carries a **unique** index and is nullable, which is the combination
 * that works: SQLite permits any number of `NULL`s in a unique index and exactly
 * one empty string, so `prepareCommission` normalises an empty box to `NULL`
 * rather than to `''`. Without that, the second commission saved with no slug
 * would collide with the first.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`commissions\` ADD \`layout\` text DEFAULT 'files';`)
  await db.run(sql`ALTER TABLE \`commissions\` ADD \`slug\` text;`)
  await db.run(sql`CREATE UNIQUE INDEX \`commissions_slug_idx\` ON \`commissions\` (\`slug\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`commissions_slug_idx\`;`)
  await db.run(sql`ALTER TABLE \`commissions\` DROP COLUMN \`layout\`;`)
  await db.run(sql`ALTER TABLE \`commissions\` DROP COLUMN \`slug\`;`)
}
