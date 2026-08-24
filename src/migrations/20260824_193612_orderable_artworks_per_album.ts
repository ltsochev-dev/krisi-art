import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Artwork ordering moves from the collection to the `artworks` join field on
 * `Albums`, so the drag handle lives on the album that gives a position meaning.
 *
 * `_order` was one sequence across every artwork; `_artworks_artworks_order` is
 * one sequence *per album*, which is why the backfill partitions by `album_id`
 * and restarts at `c000` for each. Keys repeating across albums is correct here:
 * Payload only ever compares them within a single album's scope, and it reads
 * the last key in that scope to place the next insert.
 *
 * As with the previous ordering migration, the generated SQL adds the column
 * empty — without the backfill every row would sit at NULL, the gallery would
 * fall back to sorting by title, and the first drag on an album would have no
 * key to append to. Ranking by the old `_order` preserves the order that is on
 * the site today.
 */
const BASE_36 = '0123456789abcdefghijklmnopqrstuvwxyz'

const digits = (expr: string) => `
  'c'
    || substr('${BASE_36}', ((${expr}) / 1296) % 36 + 1, 1)
    || substr('${BASE_36}', ((${expr}) / 36) % 36 + 1, 1)
    || substr('${BASE_36}', (${expr}) % 36 + 1, 1)`

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`artworks__order_idx\`;`)
  await db.run(sql`ALTER TABLE \`artworks\` ADD \`_artworks_artworks_order\` text;`)
  await db.run(
    sql`CREATE INDEX \`artworks__artworks_artworks_order_idx\` ON \`artworks\` (\`_artworks_artworks_order\`);`,
  )
  await db.run(
    sql.raw(`
      UPDATE \`artworks\` SET \`_artworks_artworks_order\` = ${digits('ranked.rank')}
      FROM (
        SELECT \`id\`,
          ROW_NUMBER() OVER (PARTITION BY \`album_id\` ORDER BY \`_order\`, \`title\`) - 1 AS rank
        FROM \`artworks\`
      ) AS ranked
      WHERE \`artworks\`.\`id\` = ranked.\`id\`;
    `),
  )
  await db.run(sql`ALTER TABLE \`artworks\` DROP COLUMN \`_order\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`artworks__artworks_artworks_order_idx\`;`)
  await db.run(sql`ALTER TABLE \`artworks\` ADD \`_order\` text;`)
  await db.run(sql`CREATE INDEX \`artworks__order_idx\` ON \`artworks\` (\`_order\`);`)
  // Back to a single sequence: album order first, so the flattened result keeps
  // the albums grouped the way the gallery renders them.
  await db.run(
    sql.raw(`
      UPDATE \`artworks\` SET \`_order\` = ${digits('ranked.rank')}
      FROM (
        SELECT a.\`id\`,
          ROW_NUMBER() OVER (
            ORDER BY al.\`_order\`, a.\`_artworks_artworks_order\`, a.\`title\`
          ) - 1 AS rank
        FROM \`artworks\` a JOIN \`albums\` al ON al.\`id\` = a.\`album_id\`
      ) AS ranked
      WHERE \`artworks\`.\`id\` = ranked.\`id\`;
    `),
  )
  await db.run(sql`ALTER TABLE \`artworks\` DROP COLUMN \`_artworks_artworks_order\`;`)
}
