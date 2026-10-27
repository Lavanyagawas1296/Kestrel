import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import * as fs from 'fs';
import * as path from 'path';

let globalDb: PGlite | null = null;

/**
 * Returns a initialized PGlite PostgreSQL instance with vector extension,
 * schema migrations, and seed rules loaded.
 */
export async function getLocalDatabase(): Promise<PGlite> {
  if (globalDb) {
    return globalDb;
  }

  const db = new PGlite({ extensions: { vector } });

  // Read and apply migration SQL
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261027000000_init_kestrel.sql');
  if (fs.existsSync(migrationPath)) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await db.exec(migrationSql);
  }

  // Create standard Supabase roles
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, anon;
  `);

  // Read and apply seed SQL
  const seedPath = path.join(process.cwd(), 'supabase/seed.sql');
  if (fs.existsSync(seedPath)) {
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await db.exec(seedSql);
  }

  globalDb = db;
  return db;
}
