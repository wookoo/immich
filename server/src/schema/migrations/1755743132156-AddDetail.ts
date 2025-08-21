import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE asset_exif ADD COLUMN detail text NULL`.execute(db);
}

export async function down(): Promise<void> {}
