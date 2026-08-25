import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * `testimonials.sortOrder` integers give way to Payload's `orderable`
 * drag-and-drop, the same swap `20260824_155112_orderable_albums_artworks` made
 * for albums and artworks.
 *
 * `_order` is not a rename of `sort_order`: it holds a fractional index (a
 * base-36 magnitude marker plus a fixed number of digits), so the old integers
 * would be invalid values in it. The column is added empty and then backfilled
 * below — without that every existing row would sit at NULL, the homepage would
 * fall back to sorting by name, and Payload would have no last key to append the
 * next drag to.
 *
 * The backfill emits `c000`, `c001`, … : one marker, three digits, so every key
 * is the same length and the lexicographic order SQLite sorts by is the numeric
 * order intended. Rows that never had a `sort_order` sort last, by name, rather
 * than jumping to the front on a NULL.
 */
const BASE_36 = '0123456789abcdefghijklmnopqrstuvwxyz'

const backfillOrder = sql.raw(`
  UPDATE \`testimonials\` SET \`_order\` = 'c'
    || substr('${BASE_36}', ((ranked.rank / 1296) % 36) + 1, 1)
    || substr('${BASE_36}', ((ranked.rank / 36) % 36) + 1, 1)
    || substr('${BASE_36}', (ranked.rank % 36) + 1, 1)
  FROM (
    SELECT \`id\`, ROW_NUMBER() OVER (
      ORDER BY \`sort_order\` IS NULL, \`sort_order\`, \`name\`
    ) - 1 AS rank FROM \`testimonials\`
  ) AS ranked
  WHERE \`testimonials\`.\`id\` = ranked.\`id\`;
`)

/** The inverse: renumber `sort_order` 0..n-1 from the current `_order`. */
const backfillSortOrder = sql.raw(`
  UPDATE \`testimonials\` SET \`sort_order\` = ranked.rank
  FROM (
    SELECT \`id\`, ROW_NUMBER() OVER (ORDER BY \`_order\`, \`name\`) - 1 AS rank
    FROM \`testimonials\`
  ) AS ranked
  WHERE \`testimonials\`.\`id\` = ranked.\`id\`;
`)

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`testimonials\` ADD \`_order\` text;`)
  await db.run(sql`CREATE INDEX \`testimonials__order_idx\` ON \`testimonials\` (\`_order\`);`)
  await db.run(backfillOrder)
  await db.run(sql`ALTER TABLE \`testimonials\` DROP COLUMN \`sort_order\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // `sort_order` was nullable with no default, so it goes back the same way.
  await db.run(sql`ALTER TABLE \`testimonials\` ADD \`sort_order\` numeric;`)
  await db.run(backfillSortOrder)
  await db.run(sql`DROP INDEX \`testimonials__order_idx\`;`)
  await db.run(sql`ALTER TABLE \`testimonials\` DROP COLUMN \`_order\`;`)
}
