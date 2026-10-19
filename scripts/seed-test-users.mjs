import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { appendFileSync } from "node:fs";
process.loadEnvFile(".env.local");
if (
  process.env.SERMONBRIDGE_LOCAL_TEST !== "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
)
  throw new Error("Local synthetic fixture only");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const ids = {};
const { data: existing, error: listError } =
  await supabase.auth.admin.listUsers();
if (listError) throw new Error("Local Auth user listing failed");
for (const name of ["admin_a", "pastor_a", "media_a", "admin_b", "outsider"]) {
  const email = `${name}@sermonbridge.example.test`;
  const found = existing.users.find((u) => u.email === email);
  if (found) {
    ids[name] = found.id;
    continue;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: process.env.TEST_USER_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin" },
  });
  if (error)
    throw new Error(
      `Local Auth fixture creation failed for ${name}: ${error.code}`,
    );
  ids[name] = data.user.id;
}
const db = new Client({ connectionString: process.env.TEST_DB_URL });
await db.connect();
const churchA = "10000000-0000-4000-8000-000000000001",
  churchB = "10000000-0000-4000-8000-000000000002";
await db.query(
  "insert into public.churches(id,name,created_by) values($1,$2,$3),($4,$5,$6) on conflict do nothing",
  [churchA, "테스트 A교회", ids.admin_a, churchB, "테스트 B교회", ids.admin_b],
);
for (const [name, role] of [
  ["admin_a", "admin"],
  ["pastor_a", "pastor"],
  ["media_a", "media"],
  ["admin_b", "admin"],
])
  await db.query(
    "insert into public.church_memberships(church_id,user_id,role,created_by) values($1,$2,$3,$4) on conflict do nothing",
    [name === "admin_b" ? churchB : churchA, ids[name], role, ids[name]],
  );
for (const [church, owner, id] of [
  [churchA, ids.admin_a, "20000000-0000-4000-8000-000000000001"],
  [churchB, ids.admin_b, "20000000-0000-4000-8000-000000000002"],
])
  await db.query(
    "insert into public.sermons(id,church_id,created_by,title,source) values($1,$2,$3,$4,$5) on conflict do nothing",
    [
      id,
      church,
      owner,
      "합성 테스트 원고",
      "실제 설교가 아닌 접근 제어 검증용 합성 문장입니다.",
    ],
  );
await db.query("notify pgrst, 'reload schema'");
await db.end();
appendFileSync(
  ".env.local",
  "\n" +
    Object.entries(ids)
      .map(([name, id]) => `TEST_${name.toUpperCase()}_ID=${id}`)
      .join("\n") +
    "\n",
);
console.log(
  "Five synthetic Auth users and two test churches prepared. No real sermon data used.",
);
