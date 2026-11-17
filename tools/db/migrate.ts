/**
 * Applies supabase/migrations/*.sql to a Supabase project through the
 * Management API, in order, recording which have run so it is safe to repeat.
 *
 *   SUPABASE_PROJECT_REF=<ref> pnpm db:migrate
 *
 * The access token comes from SUPABASE_ACCESS_TOKEN, or is supplied by the
 * environment's network proxy; it is never written anywhere by this script.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  console.error("Set SUPABASE_PROJECT_REF to the project's reference id.");
  process.exit(1);
}
const token = process.env.SUPABASE_ACCESS_TOKEN ?? "supplied-by-the-network-proxy";
const DIRECTORY = path.resolve(__dirname, "../../supabase/migrations");

async function query<T = unknown>(sql: string): Promise<T[]> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error((body as { message?: string } | null)?.message ?? `HTTP ${response.status}`);
  }
  return body as T[];
}

async function main() {
  await query(
    "create table if not exists public.site_migrations (name text primary key, applied_at timestamptz not null default now()); " +
      "alter table public.site_migrations enable row level security;",
  );
  const applied = new Set((await query<{ name: string }>("select name from public.site_migrations")).map((r) => r.name));

  const files = readdirSync(DIRECTORY).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  already applied  ${file}`);
      continue;
    }
    const sql = readFileSync(path.join(DIRECTORY, file), "utf8");
    // One request per file, so a migration and its bookkeeping row land together.
    await query(`begin;\n${sql}\ninsert into public.site_migrations (name) values ('${file}');\ncommit;`);
    console.log(`  applied          ${file}`);
  }
  console.log("Database is up to date.");
}

main().catch((error) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
