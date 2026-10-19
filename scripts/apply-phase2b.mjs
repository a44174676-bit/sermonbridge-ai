import { Client } from "pg";
import { readFileSync } from "node:fs";
process.loadEnvFile(".env.local");
if (
  process.env.SERMONBRIDGE_LOCAL_TEST !== "true" ||
  !process.env.TEST_DB_URL?.includes("@127.0.0.1:54329/")
)
  throw new Error("로컬 합성 DB에만 적용할 수 있습니다.");
const db = new Client({ connectionString: process.env.TEST_DB_URL });
await db.connect();
try {
  await db.query(
    readFileSync("supabase/migrations/202610190002_phase2b.sql", "utf8"),
  );
  await db.query("notify pgrst,'reload schema'");
  console.log("Phase 2B 마이그레이션 적용 완료. 기존 원고 유지.");
} finally {
  await db.end();
}
