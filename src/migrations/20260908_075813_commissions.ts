/**
 * Adds the `commissions` and `commission-access-log` tables.
 *
 * Three things in this schema are worth reading twice.
 *
 * The `commissions.password` column is real but is only ever `null`:
 * `prepareCommission` hashes the submitted value into `password_hash` and nulls
 * the input before it reaches the database, so the column exists as a write-only
 * input slot and nothing else. Same for `remove_password`, which is a gesture
 * rather than a state and resets itself on save.
 *
 * `enabled` defaults to `false` with no backfill, like `media.enabled` — a
 * commission is not deliverable the moment its row exists, and the gate's whole
 * point is that nothing is live until someone ticks it.
 *
 * The tables carry no reference at all to the S3 objects beyond
 * `commissions_files.key`. Those objects live in a separate private bucket that
 * is not in Terraform in this repo; `docs/plans/commissions-infra.md` is what a
 * fresh environment is reproduced from.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`commissions_files\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`file_id\` text NOT NULL,
  	\`key\` text NOT NULL,
  	\`filename\` text NOT NULL,
  	\`label\` text,
  	\`filesize\` numeric,
  	\`mime_type\` text,
  	\`uploaded_at\` text,
  	\`download_count\` numeric DEFAULT 0,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`commissions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`commissions_files_order_idx\` ON \`commissions_files\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`commissions_files_parent_id_idx\` ON \`commissions_files\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`commissions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text NOT NULL,
  	\`description\` text,
  	\`internal_notes\` text,
  	\`enabled\` integer DEFAULT false,
  	\`expires_at\` text,
  	\`password\` text,
  	\`remove_password\` integer DEFAULT false,
  	\`password_hash\` text,
  	\`view_count\` numeric DEFAULT 0,
  	\`download_count\` numeric DEFAULT 0,
  	\`last_accessed_at\` text,
  	\`uuid\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`commissions_enabled_idx\` ON \`commissions\` (\`enabled\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`commissions_uuid_idx\` ON \`commissions\` (\`uuid\`);`)
  await db.run(
    sql`CREATE INDEX \`commissions_updated_at_idx\` ON \`commissions\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`commissions_created_at_idx\` ON \`commissions\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`commission_access_log\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`commission_id\` integer NOT NULL,
  	\`event\` text NOT NULL,
  	\`filename\` text,
  	\`file_id\` text,
  	\`reason\` text,
  	\`ip\` text,
  	\`browser\` text,
  	\`os\` text,
  	\`device_type\` text,
  	\`user_agent\` text,
  	\`referer\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`commission_id\`) REFERENCES \`commissions\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX \`commission_access_log_commission_idx\` ON \`commission_access_log\` (\`commission_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`commission_access_log_event_idx\` ON \`commission_access_log\` (\`event\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`commission_access_log_ip_idx\` ON \`commission_access_log\` (\`ip\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`commission_access_log_updated_at_idx\` ON \`commission_access_log\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`commission_access_log_created_at_idx\` ON \`commission_access_log\` (\`created_at\`);`,
  )
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commissions_id\` integer REFERENCES commissions(id);`,
  )
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`commission_access_log_id\` integer REFERENCES commission_access_log(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_commissions_id_idx\` ON \`payload_locked_documents_rels\` (\`commissions_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_commission_access_log_id_idx\` ON \`payload_locked_documents_rels\` (\`commission_access_log_id\`);`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`commissions_files\`;`)
  await db.run(sql`DROP TABLE \`commissions\`;`)
  await db.run(sql`DROP TABLE \`commission_access_log\`;`)
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
  	\`clients_id\` integer,
  	\`invoices_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`albums_id\`) REFERENCES \`albums\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`artworks_id\`) REFERENCES \`artworks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`contact_submissions_id\`) REFERENCES \`contact_submissions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`testimonials_id\`) REFERENCES \`testimonials\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`invoices_id\`) REFERENCES \`invoices\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "albums_id", "artworks_id", "tags_id", "media_id", "contact_submissions_id", "users_id", "testimonials_id", "pages_id", "clients_id", "invoices_id") SELECT "id", "order", "parent_id", "path", "albums_id", "artworks_id", "tags_id", "media_id", "contact_submissions_id", "users_id", "testimonials_id", "pages_id", "clients_id", "invoices_id" FROM \`payload_locked_documents_rels\`;`,
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
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_clients_id_idx\` ON \`payload_locked_documents_rels\` (\`clients_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_invoices_id_idx\` ON \`payload_locked_documents_rels\` (\`invoices_id\`);`,
  )
}
