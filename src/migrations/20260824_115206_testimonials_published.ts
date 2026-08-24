import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`testimonials\` ADD \`published\` integer DEFAULT true;`)
  await db.run(
    sql`CREATE INDEX \`testimonials_published_idx\` ON \`testimonials\` (\`published\`);`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`testimonials_published_idx\`;`)
  await db.run(sql`ALTER TABLE \`testimonials\` DROP COLUMN \`published\`;`)
}
