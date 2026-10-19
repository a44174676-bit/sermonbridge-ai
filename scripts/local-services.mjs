// Isolated, synthetic Supabase-compatible test stack. Never point this at a hosted project.
import { randomBytes, createHmac } from "node:crypto";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
const envFile = new URL("../.env.local", import.meta.url);
if (
  existsSync(envFile) &&
  !readFileSync(envFile, "utf8").includes("SERMONBRIDGE_LOCAL_TEST=true")
)
  throw new Error("Refusing to overwrite existing .env.local");
const existingContainers = execFileSync(
  "docker",
  ["ps", "-a", "--format", "{{.Names}}"],
  { encoding: "utf8" },
).split("\n");
if (
  ["sb-phase2a-db", "sb-phase2a-auth", "sb-phase2a-rest"].some((n) =>
    existingContainers.includes(n),
  )
)
  throw new Error(
    "Existing synthetic containers found; do not overwrite their credentials. See cleanup instructions.",
  );
const jwtSecret = randomBytes(40).toString("hex");
function jwt(role) {
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const body =
    enc({ alg: "HS256", typ: "JWT" }) +
    "." +
    enc({
      role,
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    });
  return (
    body +
    "." +
    createHmac("sha256", jwtSecret).update(body).digest("base64url")
  );
}
const password = randomBytes(24).toString("hex");
const vars = {
  SERMONBRIDGE_LOCAL_TEST: "true",
  APP_MODE: "auto",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
  SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
  TEST_DB_URL: `postgresql://postgres:${password}@127.0.0.1:54329/postgres`,
  TEST_USER_PASSWORD: randomBytes(20).toString("hex"),
  POSTGRES_PASSWORD: password,
  GOTRUE_DB_DRIVER: "postgres",
  GOTRUE_DB_DATABASE_URL: `postgresql://postgres:${password}@sb-phase2a-db:5432/postgres?sslmode=disable&search_path=auth`,
  GOTRUE_DB_NAMESPACE: "auth",
  GOTRUE_API_HOST: "0.0.0.0",
  GOTRUE_API_PORT: "9999",
  API_EXTERNAL_URL: "http://127.0.0.1:54321",
  GOTRUE_SITE_URL: "http://127.0.0.1:3001",
  GOTRUE_JWT_SECRET: jwtSecret,
  GOTRUE_JWT_EXP: "3600",
  GOTRUE_JWT_AUD: "authenticated",
  GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
  GOTRUE_JWT_ADMIN_ROLES: "service_role",
  GOTRUE_DISABLE_SIGNUP: "true",
  GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
  GOTRUE_MAILER_AUTOCONFIRM: "true",
  PGRST_DB_URI: `postgres://postgres:${password}@sb-phase2a-db:5432/postgres`,
  PGRST_DB_SCHEMAS: "public",
  PGRST_DB_ANON_ROLE: "anon",
  PGRST_JWT_SECRET: jwtSecret,
};
writeFileSync(
  envFile,
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
const docker = (...args) =>
  execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
try {
  docker("network", "inspect", "sb-phase2a-test");
} catch {
  docker("network", "create", "sb-phase2a-test");
}
// Do not silently remove an existing test database; stop/delete only with the documented cleanup command.
for (const name of ["sb-phase2a-db", "sb-phase2a-auth", "sb-phase2a-rest"]) {
  try {
    docker("inspect", name);
    throw new Error(
      `${name} already exists; preserve or explicitly clean up the previous synthetic stack first.`,
    );
  } catch (e) {
    if (!e.status) throw e;
  }
}
docker(
  "run",
  "-d",
  "--name",
  "sb-phase2a-db",
  "--network",
  "sb-phase2a-test",
  "--env-file",
  envFile.pathname,
  "-p",
  "127.0.0.1:54329:5432",
  "postgres:17-alpine",
);
async function retry(fn) {
  for (let i = 0; i < 40; i++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Local service did not become ready");
}
await retry(async () => {
  const c = new Client({ connectionString: vars.TEST_DB_URL });
  await c.connect();
  await c.end();
});
const db = new Client({ connectionString: vars.TEST_DB_URL });
await db.connect();
await db.query(
  `create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; grant usage on schema public,auth to anon,authenticated,service_role; create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;`,
);
await db.query("alter role postgres set search_path to auth,public");
docker(
  "run",
  "-d",
  "--name",
  "sb-phase2a-auth",
  "--network",
  "sb-phase2a-test",
  "--env-file",
  envFile.pathname,
  "-p",
  "127.0.0.1:54324:9999",
  "supabase/gotrue:v2.186.0",
);
await retry(async () => {
  const r = await fetch("http://127.0.0.1:54324/health");
  if (!r.ok) throw new Error();
});
await db.query(
  readFileSync(
    new URL("../supabase/migrations/202610190001_phase2a.sql", import.meta.url),
    "utf8",
  ),
);
await db.end();
docker(
  "run",
  "-d",
  "--name",
  "sb-phase2a-rest",
  "--network",
  "sb-phase2a-test",
  "--env-file",
  envFile.pathname,
  "-p",
  "127.0.0.1:54323:3000",
  "postgrest/postgrest:v13.0.7",
);
await retry(async () => {
  const r = await fetch("http://127.0.0.1:54323/");
  if (!r.ok) throw new Error();
});
console.log(
  "Local PostgreSQL + Supabase Auth + PostgREST ready. Synthetic credentials saved only in ignored .env.local. Start test-gateway.mjs next.",
);
