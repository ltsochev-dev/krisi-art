/**
 * Adds the hero skill chips (`homepage.skills`) as an ordered array of captions.
 *
 * Unlike `media.enabled`, this one backfills. `defaultValue` on a field only
 * fires when the document is *created*, and the homepage global row already
 * exists on every database this migration will ever run against — so without
 * the seed below an existing install would come up with no chips at all and the
 * editor would have to retype the five defaults by hand.
 *
 * The insert is guarded by `NOT EXISTS`, so it is a no-op on any homepage that
 * already has rows, and `lower(hex(randomblob(12)))` matches the 24-character
 * hex ids Payload generates for array rows elsewhere in the schema. `_order` is
 * 1-based and is what the admin panel's drag handles rewrite.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`homepage_skills\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`homepage\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`homepage_skills_order_idx\` ON \`homepage_skills\` (\`_order\`);`)
  await db.run(
    sql`CREATE INDEX \`homepage_skills_parent_id_idx\` ON \`homepage_skills\` (\`_parent_id\`);`,
  )

  await db.run(sql`
  	INSERT INTO \`homepage_skills\` (\`_order\`, \`_parent_id\`, \`id\`, \`label\`)
  	SELECT \`defaults\`.\`_order\`, \`homepage\`.\`id\`, lower(hex(randomblob(12))), \`defaults\`.\`label\`
  	FROM \`homepage\`
  	CROSS JOIN (
  		          SELECT 1 AS \`_order\`, 'Traditional Painting' AS \`label\`
  		UNION ALL SELECT 2, 'Digital Art'
  		UNION ALL SELECT 3, 'Comic Books'
  		UNION ALL SELECT 4, 'Game Art'
  		UNION ALL SELECT 5, 'Concept Art'
  	) AS \`defaults\`
  	WHERE NOT EXISTS (
  		SELECT 1 FROM \`homepage_skills\` WHERE \`homepage_skills\`.\`_parent_id\` = \`homepage\`.\`id\`
  	);
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`homepage_skills\`;`)
}
