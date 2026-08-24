import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`homepage\` ADD \`contacts_heading\` text DEFAULT 'Let''s Create Together' NOT NULL;`,
  )
  await db.run(
    sql`ALTER TABLE \`homepage\` ADD \`contacts_subtitle\` text DEFAULT 'Interested in commissioning a piece or collaborating on a project? I''d love to hear about your vision.';`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`homepage\` DROP COLUMN \`contacts_heading\`;`)
  await db.run(sql`ALTER TABLE \`homepage\` DROP COLUMN \`contacts_subtitle\`;`)
}
