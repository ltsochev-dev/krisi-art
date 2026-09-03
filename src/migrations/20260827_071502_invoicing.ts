import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`clients\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`kind\` text DEFAULT 'company' NOT NULL,
  	\`name\` text NOT NULL,
  	\`eik\` text,
  	\`vat_number\` text,
  	\`responsible_person\` text,
  	\`address\` text NOT NULL,
  	\`city\` text NOT NULL,
  	\`postal_code\` text,
  	\`country\` text DEFAULT 'България' NOT NULL,
  	\`email\` text,
  	\`phone\` text,
  	\`notes\` text,
  	\`archived\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`clients_name_idx\` ON \`clients\` (\`name\`);`)
  await db.run(sql`CREATE INDEX \`clients_archived_idx\` ON \`clients\` (\`archived\`);`)
  await db.run(sql`CREATE INDEX \`clients_updated_at_idx\` ON \`clients\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`clients_created_at_idx\` ON \`clients\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`invoices_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`description\` text NOT NULL,
  	\`quantity\` numeric DEFAULT 1 NOT NULL,
  	\`unit\` text DEFAULT 'piece',
  	\`unit_price\` numeric NOT NULL,
  	\`total\` numeric,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`invoices\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`invoices_items_order_idx\` ON \`invoices_items\` (\`_order\`);`)
  await db.run(
    sql`CREATE INDEX \`invoices_items_parent_id_idx\` ON \`invoices_items\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`invoices\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`client_id\` integer NOT NULL,
  	\`issue_date\` text NOT NULL,
  	\`due_date\` text,
  	\`place_of_issue\` text,
  	\`payment_method\` text,
  	\`currency\` text NOT NULL,
  	\`exchange_rate\` numeric,
  	\`discount_percent\` numeric,
  	\`subtotal\` numeric,
  	\`discount_amount\` numeric,
  	\`total\` numeric,
  	\`total_in_words\` text,
  	\`base_total\` numeric,
  	\`notes\` text,
  	\`internal_notes\` text,
  	\`seller_legal_name\` text,
  	\`seller_identifier\` text,
  	\`seller_activity\` text,
  	\`seller_address\` text,
  	\`seller_city\` text,
  	\`seller_postal_code\` text,
  	\`seller_country\` text,
  	\`seller_email\` text,
  	\`seller_phone\` text,
  	\`seller_website\` text,
  	\`seller_bank_name\` text,
  	\`seller_iban\` text,
  	\`seller_bic\` text,
  	\`seller_legal_note\` text,
  	\`bill_to_name\` text,
  	\`bill_to_kind\` text,
  	\`bill_to_eik\` text,
  	\`bill_to_vat_number\` text,
  	\`bill_to_responsible_person\` text,
  	\`bill_to_address\` text,
  	\`bill_to_city\` text,
  	\`bill_to_postal_code\` text,
  	\`bill_to_country\` text,
  	\`bill_to_email\` text,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`invoice_number\` text,
  	\`paid_date\` text,
  	\`uuid\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`invoices_client_idx\` ON \`invoices\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX \`invoices_issue_date_idx\` ON \`invoices\` (\`issue_date\`);`)
  await db.run(sql`CREATE INDEX \`invoices_status_idx\` ON \`invoices\` (\`status\`);`)
  await db.run(
    sql`CREATE UNIQUE INDEX \`invoices_invoice_number_idx\` ON \`invoices\` (\`invoice_number\`);`,
  )
  await db.run(sql`CREATE UNIQUE INDEX \`invoices_uuid_idx\` ON \`invoices\` (\`uuid\`);`)
  await db.run(sql`CREATE INDEX \`invoices_updated_at_idx\` ON \`invoices\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`invoices_created_at_idx\` ON \`invoices\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`_invoices_v_version_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`description\` text NOT NULL,
  	\`quantity\` numeric DEFAULT 1 NOT NULL,
  	\`unit\` text DEFAULT 'piece',
  	\`unit_price\` numeric NOT NULL,
  	\`total\` numeric,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_invoices_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_items_order_idx\` ON \`_invoices_v_version_items\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_items_parent_id_idx\` ON \`_invoices_v_version_items\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`_invoices_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_client_id\` integer NOT NULL,
  	\`version_issue_date\` text NOT NULL,
  	\`version_due_date\` text,
  	\`version_place_of_issue\` text,
  	\`version_payment_method\` text,
  	\`version_currency\` text NOT NULL,
  	\`version_exchange_rate\` numeric,
  	\`version_discount_percent\` numeric,
  	\`version_subtotal\` numeric,
  	\`version_discount_amount\` numeric,
  	\`version_total\` numeric,
  	\`version_total_in_words\` text,
  	\`version_base_total\` numeric,
  	\`version_notes\` text,
  	\`version_internal_notes\` text,
  	\`version_seller_legal_name\` text,
  	\`version_seller_identifier\` text,
  	\`version_seller_activity\` text,
  	\`version_seller_address\` text,
  	\`version_seller_city\` text,
  	\`version_seller_postal_code\` text,
  	\`version_seller_country\` text,
  	\`version_seller_email\` text,
  	\`version_seller_phone\` text,
  	\`version_seller_website\` text,
  	\`version_seller_bank_name\` text,
  	\`version_seller_iban\` text,
  	\`version_seller_bic\` text,
  	\`version_seller_legal_note\` text,
  	\`version_bill_to_name\` text,
  	\`version_bill_to_kind\` text,
  	\`version_bill_to_eik\` text,
  	\`version_bill_to_vat_number\` text,
  	\`version_bill_to_responsible_person\` text,
  	\`version_bill_to_address\` text,
  	\`version_bill_to_city\` text,
  	\`version_bill_to_postal_code\` text,
  	\`version_bill_to_country\` text,
  	\`version_bill_to_email\` text,
  	\`version_status\` text DEFAULT 'draft' NOT NULL,
  	\`version_invoice_number\` text,
  	\`version_paid_date\` text,
  	\`version_uuid\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`invoices\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_invoices_v_parent_idx\` ON \`_invoices_v\` (\`parent_id\`);`)
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_version_client_idx\` ON \`_invoices_v\` (\`version_client_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_version_issue_date_idx\` ON \`_invoices_v\` (\`version_issue_date\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_version_status_idx\` ON \`_invoices_v\` (\`version_status\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_version_invoice_number_idx\` ON \`_invoices_v\` (\`version_invoice_number\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_version_uuid_idx\` ON \`_invoices_v\` (\`version_uuid\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_version_updated_at_idx\` ON \`_invoices_v\` (\`version_updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_version_version_created_at_idx\` ON \`_invoices_v\` (\`version_created_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_created_at_idx\` ON \`_invoices_v\` (\`created_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_invoices_v_updated_at_idx\` ON \`_invoices_v\` (\`updated_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`invoice_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`seller_legal_name\` text NOT NULL,
  	\`seller_identifier\` text NOT NULL,
  	\`seller_activity\` text,
  	\`seller_address\` text NOT NULL,
  	\`seller_city\` text NOT NULL,
  	\`seller_postal_code\` text,
  	\`seller_country\` text DEFAULT 'България' NOT NULL,
  	\`seller_email\` text,
  	\`seller_phone\` text,
  	\`seller_website\` text,
  	\`legal_note\` text DEFAULT 'Не се начислява ДДС на основание чл. 113, ал. 9 от ЗДДС.',
  	\`logo_id\` integer,
  	\`signature_id\` integer,
  	\`bank_name\` text,
  	\`bank_iban\` text,
  	\`bank_bic\` text,
  	\`numbering_next_number\` numeric DEFAULT 1 NOT NULL,
  	\`defaults_currency\` text DEFAULT 'EUR',
  	\`defaults_payment_terms_days\` numeric DEFAULT 14,
  	\`defaults_place_of_issue\` text DEFAULT 'София',
  	\`defaults_payment_method\` text DEFAULT 'bank',
  	\`defaults_notes\` text,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`signature_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX \`invoice_settings_logo_idx\` ON \`invoice_settings\` (\`logo_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`invoice_settings_signature_idx\` ON \`invoice_settings\` (\`signature_id\`);`,
  )
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`clients_id\` integer REFERENCES clients(id);`,
  )
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`invoices_id\` integer REFERENCES invoices(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_invoices_id_idx\` ON \`payload_locked_documents_rels\` (\`invoices_id\`);`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`clients\`;`)
  await db.run(sql`DROP TABLE \`invoices_items\`;`)
  await db.run(sql`DROP TABLE \`invoices\`;`)
  await db.run(sql`DROP TABLE \`_invoices_v_version_items\`;`)
  await db.run(sql`DROP TABLE \`_invoices_v\`;`)
  await db.run(sql`DROP TABLE \`invoice_settings\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`albums_id\` integer,
  	\`artworks_id\` integer,
  	\`tags_id\` integer,
  	\`media_id\` integer,
  	\`contact_submissions_id\` integer,
  	\`users_id\` integer,
  	\`testimonials_id\` integer,
  	\`pages_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`artworks_id\`) REFERENCES \`artworks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`contact_submissions_id\`) REFERENCES \`contact_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`testimonials_id\`) REFERENCES \`testimonials\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "albums_id", "artworks_id", "tags_id", "media_id", "contact_submissions_id", "users_id", "testimonials_id", "pages_id") SELECT "id", "order", "parent_id", "path", "albums_id", "artworks_id", "tags_id", "media_id", "contact_submissions_id", "users_id", "testimonials_id", "pages_id" FROM \`payload_locked_documents_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  )
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_albums_id_idx\` ON \`payload_locked_documents_rels\` (\`albums_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_artworks_id_idx\` ON \`payload_locked_documents_rels\` (\`artworks_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`tags_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_contact_submissions_id_idx\` ON \`payload_locked_documents_rels\` (\`contact_submissions_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_testimonials_id_idx\` ON \`payload_locked_documents_rels\` (\`testimonials_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`,
  )
}
