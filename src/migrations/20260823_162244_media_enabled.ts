/**
 * Adds the `media.enabled` readiness gate.
 *
 * Note the deliberate lack of a backfill: existing uploads land on the `false`
 * default and go dark until someone ticks them. That is the safe direction for
 * a gate whose whole point is that nothing is public until it is reviewed — but
 * on a database that already has live images, expect to re-enable them by hand.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`enabled\` integer DEFAULT false;`)
  await db.run(sql`CREATE INDEX \`media_enabled_idx\` ON \`media\` (\`enabled\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`media_enabled_idx\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`enabled\`;`)
}
