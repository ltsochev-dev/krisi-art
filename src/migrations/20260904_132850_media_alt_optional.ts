/**
 * Drops `NOT NULL` from `media.alt`, so an image can be uploaded without one.
 *
 * SQLite cannot relax a column constraint in place, hence the copy into
 * `__new_media` and the rename — the generated shape, kept verbatim.
 *
 * `down` restores `NOT NULL` and therefore fails on any row whose alt is empty:
 * backfill those first (`UPDATE media SET alt = filename WHERE alt IS NULL`) if
 * this ever has to be rolled back.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`enabled\` integer DEFAULT false,
  	\`alt\` text,
  	\`caption\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_thumbnail_url\` text,
  	\`sizes_thumbnail_width\` numeric,
  	\`sizes_thumbnail_height\` numeric,
  	\`sizes_thumbnail_mime_type\` text,
  	\`sizes_thumbnail_filesize\` numeric,
  	\`sizes_thumbnail_filename\` text,
  	\`sizes_card_url\` text,
  	\`sizes_card_width\` numeric,
  	\`sizes_card_height\` numeric,
  	\`sizes_card_mime_type\` text,
  	\`sizes_card_filesize\` numeric,
  	\`sizes_card_filename\` text,
  	\`sizes_tablet_url\` text,
  	\`sizes_tablet_width\` numeric,
  	\`sizes_tablet_height\` numeric,
  	\`sizes_tablet_mime_type\` text,
  	\`sizes_tablet_filesize\` numeric,
  	\`sizes_tablet_filename\` text,
  	\`sizes_hero_url\` text,
  	\`sizes_hero_width\` numeric,
  	\`sizes_hero_height\` numeric,
  	\`sizes_hero_mime_type\` text,
  	\`sizes_hero_filesize\` numeric,
  	\`sizes_hero_filename\` text
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_media\`("id", "enabled", "alt", "caption", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "sizes_thumbnail_url", "sizes_thumbnail_width", "sizes_thumbnail_height", "sizes_thumbnail_mime_type", "sizes_thumbnail_filesize", "sizes_thumbnail_filename", "sizes_card_url", "sizes_card_width", "sizes_card_height", "sizes_card_mime_type", "sizes_card_filesize", "sizes_card_filename", "sizes_tablet_url", "sizes_tablet_width", "sizes_tablet_height", "sizes_tablet_mime_type", "sizes_tablet_filesize", "sizes_tablet_filename", "sizes_hero_url", "sizes_hero_width", "sizes_hero_height", "sizes_hero_mime_type", "sizes_hero_filesize", "sizes_hero_filename") SELECT "id", "enabled", "alt", "caption", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "sizes_thumbnail_url", "sizes_thumbnail_width", "sizes_thumbnail_height", "sizes_thumbnail_mime_type", "sizes_thumbnail_filesize", "sizes_thumbnail_filename", "sizes_card_url", "sizes_card_width", "sizes_card_height", "sizes_card_mime_type", "sizes_card_filesize", "sizes_card_filename", "sizes_tablet_url", "sizes_tablet_width", "sizes_tablet_height", "sizes_tablet_mime_type", "sizes_tablet_filesize", "sizes_tablet_filename", "sizes_hero_url", "sizes_hero_width", "sizes_hero_height", "sizes_hero_mime_type", "sizes_hero_filesize", "sizes_hero_filename" FROM \`media\`;`,
  )
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`ALTER TABLE \`__new_media\` RENAME TO \`media\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`media_enabled_idx\` ON \`media\` (\`enabled\`);`)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(
    sql`CREATE INDEX \`media_sizes_thumbnail_sizes_thumbnail_filename_idx\` ON \`media\` (\`sizes_thumbnail_filename\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`media_sizes_card_sizes_card_filename_idx\` ON \`media\` (\`sizes_card_filename\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`media_sizes_tablet_sizes_tablet_filename_idx\` ON \`media\` (\`sizes_tablet_filename\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`media_sizes_hero_sizes_hero_filename_idx\` ON \`media\` (\`sizes_hero_filename\`);`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`enabled\` integer DEFAULT false,
  	\`alt\` text NOT NULL,
  	\`caption\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_thumbnail_url\` text,
  	\`sizes_thumbnail_width\` numeric,
  	\`sizes_thumbnail_height\` numeric,
  	\`sizes_thumbnail_mime_type\` text,
  	\`sizes_thumbnail_filesize\` numeric,
  	\`sizes_thumbnail_filename\` text,
  	\`sizes_card_url\` text,
  	\`sizes_card_width\` numeric,
  	\`sizes_card_height\` numeric,
  	\`sizes_card_mime_type\` text,
  	\`sizes_card_filesize\` numeric,
  	\`sizes_card_filename\` text,
  	\`sizes_tablet_url\` text,
  	\`sizes_tablet_width\` numeric,
  	\`sizes_tablet_height\` numeric,
  	\`sizes_tablet_mime_type\` text,
  	\`sizes_tablet_filesize\` numeric,
  	\`sizes_tablet_filename\` text,
  	\`sizes_hero_url\` text,
  	\`sizes_hero_width\` numeric,
  	\`sizes_hero_height\` numeric,
  	\`sizes_hero_mime_type\` text,
  	\`sizes_hero_filesize\` numeric,
  	\`sizes_hero_filename\` text
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_media\`("id", "enabled", "alt", "caption", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "sizes_thumbnail_url", "sizes_thumbnail_width", "sizes_thumbnail_height", "sizes_thumbnail_mime_type", "sizes_thumbnail_filesize", "sizes_thumbnail_filename", "sizes_card_url", "sizes_card_width", "sizes_card_height", "sizes_card_mime_type", "sizes_card_filesize", "sizes_card_filename", "sizes_tablet_url", "sizes_tablet_width", "sizes_tablet_height", "sizes_tablet_mime_type", "sizes_tablet_filesize", "sizes_tablet_filename", "sizes_hero_url", "sizes_hero_width", "sizes_hero_height", "sizes_hero_mime_type", "sizes_hero_filesize", "sizes_hero_filename") SELECT "id", "enabled", "alt", "caption", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "sizes_thumbnail_url", "sizes_thumbnail_width", "sizes_thumbnail_height", "sizes_thumbnail_mime_type", "sizes_thumbnail_filesize", "sizes_thumbnail_filename", "sizes_card_url", "sizes_card_width", "sizes_card_height", "sizes_card_mime_type", "sizes_card_filesize", "sizes_card_filename", "sizes_tablet_url", "sizes_tablet_width", "sizes_tablet_height", "sizes_tablet_mime_type", "sizes_tablet_filesize", "sizes_tablet_filename", "sizes_hero_url", "sizes_hero_width", "sizes_hero_height", "sizes_hero_mime_type", "sizes_hero_filesize", "sizes_hero_filename" FROM \`media\`;`,
  )
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`ALTER TABLE \`__new_media\` RENAME TO \`media\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`media_enabled_idx\` ON \`media\` (\`enabled\`);`)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(
    sql`CREATE INDEX \`media_sizes_thumbnail_sizes_thumbnail_filename_idx\` ON \`media\` (\`sizes_thumbnail_filename\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`media_sizes_card_sizes_card_filename_idx\` ON \`media\` (\`sizes_card_filename\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`media_sizes_tablet_sizes_tablet_filename_idx\` ON \`media\` (\`sizes_tablet_filename\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`media_sizes_hero_sizes_hero_filename_idx\` ON \`media\` (\`sizes_hero_filename\`);`,
  )
}
