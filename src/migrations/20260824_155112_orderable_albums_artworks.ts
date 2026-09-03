import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * `sortOrder` integers give way to Payload's `orderable` drag-and-drop on both
 * `albums` and `artworks`, and `homepage.imagesPerAlbum` goes with the gallery's
 * per-album cap.
 *
 * `_order` is not a rename of `sort_order`: it holds a fractional index (a
 * base-36 magnitude marker plus a fixed number of digits), so the old integers
 * would be invalid values in it. The column is added empty and then backfilled
 * below — without that, every existing row would sit at NULL, the gallery would
 * fall back to sorting by title, and Payload would have no last key to append
 * the next drag to.
 *
 * The backfill emits `c000`, `c001`, … : one marker, three digits, so every key
 * is the same length and the lexicographic order SQLite sorts by is the numeric
 * order intended. That is 46,656 rows per table, far past anything this site
 * will hold, and Payload carries into `d0000` on its own if it were ever hit.
 */
const BASE_36 = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * Ranks `table` by `orderBy` and writes the matching fractional key into
 * `_order`. `ROW_NUMBER()` needs SQLite 3.25 and `UPDATE … FROM` needs 3.33;
 * both long predate the bundled driver.
 */
const backfillOrder = (table: string, orderBy: string) =>
  sql.raw(`
  UPDATE \`${table}\` SET \`_order\` = 'c'
    || substr('${BASE_36}', ((ranked.rank / 1296) % 36) + 1, 1)
    || substr('${BASE_36}', ((ranked.rank / 36) % 36) + 1, 1)
    || substr('${BASE_36}', (ranked.rank % 36) + 1, 1)
  FROM (
    SELECT \`id\`, ROW_NUMBER() OVER (ORDER BY ${orderBy}) - 1 AS rank FROM \`${table}\`
  ) AS ranked
  WHERE \`${table}\`.\`id\` = ranked.\`id\`;
`)

/** The inverse: renumber `sort_order` 0..n-1 from the current `_order`. */
const backfillSortOrder = (table: string) =>
  sql.raw(`
  UPDATE \`${table}\` SET \`sort_order\` = ranked.rank
  FROM (
    SELECT \`id\`, ROW_NUMBER() OVER (ORDER BY \`_order\`, \`title\`) - 1 AS rank FROM \`${table}\`
  ) AS ranked
  WHERE \`${table}\`.\`id\` = ranked.\`id\`;
`)

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`albums_sort_order_idx\`;`)
  await db.run(sql`ALTER TABLE \`albums\` ADD \`_order\` text;`)
  await db.run(sql`CREATE INDEX \`albums__order_idx\` ON \`albums\` (\`_order\`);`)
  await db.run(backfillOrder('albums', '`sort_order`, `title`'))
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`sort_order\`;`)

  await db.run(sql`DROP INDEX \`artworks_sort_order_idx\`;`)
  await db.run(sql`ALTER TABLE \`artworks\` ADD \`_order\` text;`)
  await db.run(sql`CREATE INDEX \`artworks__order_idx\` ON \`artworks\` (\`_order\`);`)
  // Ranked within album, so an artwork's neighbours stay its album's other
  // artworks — the gallery sorts by album first and then by this.
  await db.run(backfillOrder('artworks', '`album_id`, `sort_order`, `title`'))
  await db.run(sql`ALTER TABLE \`artworks\` DROP COLUMN \`sort_order\`;`)

  await db.run(sql`ALTER TABLE \`homepage\` DROP COLUMN \`images_per_album\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`albums__order_idx\`;`)
  await db.run(sql`ALTER TABLE \`albums\` ADD \`sort_order\` numeric DEFAULT 0 NOT NULL;`)
  await db.run(sql`CREATE INDEX \`albums_sort_order_idx\` ON \`albums\` (\`sort_order\`);`)
  await db.run(backfillSortOrder('albums'))
  await db.run(sql`ALTER TABLE \`albums\` DROP COLUMN \`_order\`;`)

  await db.run(sql`DROP INDEX \`artworks__order_idx\`;`)
  await db.run(sql`ALTER TABLE \`artworks\` ADD \`sort_order\` numeric DEFAULT 0 NOT NULL;`)
  await db.run(sql`CREATE INDEX \`artworks_sort_order_idx\` ON \`artworks\` (\`sort_order\`);`)
  await db.run(backfillSortOrder('artworks'))
  await db.run(sql`ALTER TABLE \`artworks\` DROP COLUMN \`_order\`;`)

  await db.run(sql`ALTER TABLE \`homepage\` ADD \`images_per_album\` numeric DEFAULT 8 NOT NULL;`)
}
