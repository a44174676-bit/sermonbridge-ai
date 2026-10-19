// 선택적 실제 API 검증: 명시적으로 설정한 로컬 합성 DB에만 기록하며 예산 RPC를 우회하지 않습니다.
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { openAIProvider } from "../src/lib/ai/provider";
import { runGeneration } from "../src/lib/ai/engine";
import { languages, analysisSchema } from "../src/lib/ai/schema";
import { syntheticSource } from "../tests/fixtures/ai";
process.loadEnvFile(".env.local");
if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.log(
    "미실행: OPENAI_API_KEY 또는 OPENAI_MODEL이 없습니다. 실제 API 성공으로 계산하지 않습니다.",
  );
  process.exit(2);
}
if (
  process.env.SERMONBRIDGE_LOCAL_TEST !== "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
)
  throw new Error("합성 테스트용 로컬 환경만 허용합니다.");
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: 90000,
});
const worker = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const db = new Client({ connectionString: process.env.TEST_DB_URL });
await db.connect();
try {
  const policy = (await db.query("select * from public.ai_policy")).rows[0];
  if (!policy.enabled || policy.model !== process.env.OPENAI_MODEL)
    throw new Error("모델·가격·비용 한도를 확인한 후 DB 정책을 활성화하세요.");
  await client.models.retrieve(process.env.OPENAI_MODEL);
  const id = randomUUID();
  await db.query(
    "insert into public.sermons(id,church_id,created_by,title,scripture,source) values($1,$2,$3,$4,$5,$6)",
    [
      id,
      "10000000-0000-4000-8000-000000000001",
      process.env.TEST_ADMIN_A_ID,
      syntheticSource.title,
      syntheticSource.scripture,
      syntheticSource.source,
    ],
  );
  for (const stage of ["analysis", ...languages]) {
    const source = (
      await db.query("select * from public.sermons where id=$1", [id])
    ).rows[0];
    const analysis =
      stage === "analysis"
        ? null
        : analysisSchema.parse(
            (
              await db.query(
                "select data from public.sermon_analyses where sermon_id=$1",
                [id],
              )
            ).rows[0].data,
          );
    const result = await runGeneration(
      worker,
      process.env.TEST_ADMIN_A_ID!,
      randomUUID(),
      {
        source,
        analysis,
        model: process.env.OPENAI_MODEL,
        kind: stage === "analysis" ? "analysis" : "translation",
        language:
          stage === "analysis" ? "ko" : (stage as (typeof languages)[number]),
      },
      openAIProvider(client),
    );
    console.log(`${stage}: ${result.status} (작업 ${result.id})`);
    if (result.status !== "succeeded")
      throw new Error("작업 실패: DB에 기록된 실패 코드를 확인하세요.");
  }
  console.log(
    "실제 API 분석 및 5개 언어 구조화 출력 검증 완료. 사용량은 generation_jobs에 저장했습니다.",
  );
} catch (e) {
  console.error(
    e instanceof Error && e.message.startsWith("모델·")
      ? e.message
      : "실제 검증 실패. 키·모델 접근·API 네트워크·DB 정책·작업 기록을 확인하세요.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
