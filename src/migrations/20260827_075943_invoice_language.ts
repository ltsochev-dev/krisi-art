import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * `invoices.language` — the invoice is printed in one language chosen per document
 * rather than bilingually, so the choice has to be stored alongside the rest of
 * what prints. `invoice_settings.defaults_language` is what a new invoice
 * prefills from.
 *
 * Two edits to what `migrate:create` generated, both about the same line.
 *
 * The generated statement was `ADD \`language\` text NOT NULL`, which SQLite
 * refuses outright — "Cannot add a NOT NULL column with default value NULL" —
 * whether or not the table holds rows. `DEFAULT 'bg'` is what makes it legal, and
 * it doubles as the backfill: every invoice that predates this column was rendered
 * with Bulgarian as its primary language, so Bulgarian is what those documents
 * already were.
 *
 * The default is deliberately not declared on the Payload field, where the value
 * comes from an async `defaultValue` that reads the settings global. That leaves
 * the column carrying a SQL default the drizzle snapshot does not record, which is
 * harmless: `migrate:create` diffs the previous snapshot against the schema
 * definition and never introspects the database, so this cannot surface as drift in
 * a later migration.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`invoices\` ADD \`language\` text DEFAULT 'bg' NOT NULL;`)
  await db.run(
    sql`ALTER TABLE \`_invoices_v\` ADD \`version_language\` text DEFAULT 'bg' NOT NULL;`,
  )
  await db.run(sql`ALTER TABLE \`invoice_settings\` ADD \`defaults_language\` text DEFAULT 'bg';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`invoices\` DROP COLUMN \`language\`;`)
  await db.run(sql`ALTER TABLE \`_invoices_v\` DROP COLUMN \`version_language\`;`)
  await db.run(sql`ALTER TABLE \`invoice_settings\` DROP COLUMN \`defaults_language\`;`)
}
