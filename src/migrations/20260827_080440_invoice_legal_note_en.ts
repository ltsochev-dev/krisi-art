import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * `invoice_settings.legal_note_en` — the чл. 113, ал. 9 statement in English, for
 * invoices printed in English.
 *
 * As generated, and correct as generated: the column is nullable with a SQL
 * default, which SQLite applies to the row that already exists. So an installation
 * that has already configured its Bulgarian note comes out of this migration with
 * a usable English one rather than a blank that would silently fall back.
 *
 * Only the settings table changes. The invoice's own frozen copy of the note stays
 * a single `seller_legal_note` column, because by the time it is written the
 * language is decided and only one of the two can ever print — see
 * `@/lib/invoicing/snapshot`.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`invoice_settings\` ADD \`legal_note_en\` text DEFAULT 'VAT is not charged pursuant to Art. 113(9) of the Bulgarian Value Added Tax Act.';`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`invoice_settings\` DROP COLUMN \`legal_note_en\`;`)
}
