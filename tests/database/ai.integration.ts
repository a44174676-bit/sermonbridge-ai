import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { runGeneration } from "../../src/lib/ai/engine";
import {
  inputBound,
  type Plan,
  type Provider,
} from "../../src/lib/ai/provider";
import { languages, type Language, type Source } from "../../src/lib/ai/schema";
import { mockAnalysis, mockTranslation, syntheticSource } from "../fixtures/ai";
process.loadEnvFile(".env.local");
if (
  process.env.SERMONBRIDGE_LOCAL_TEST !== "true" ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
)
  throw new Error("로컬 합성 DB만 허용합니다.");
const db = new Client({ connectionString: process.env.TEST_DB_URL });
const worker = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const user = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const target = randomUUID(),
  church = "10000000-0000-4000-8000-000000000001",
  actor = process.env.TEST_ADMIN_A_ID!;
let initialPolicy: Record<string, unknown>;
before(async () => {
  await db.connect();
  initialPolicy = (await db.query("select * from public.ai_policy")).rows[0];
  await db.query(
    "update public.ai_policy set enabled=true,model='gpt-4.1-mini',input_usd_per_million=1,output_usd_per_million=5,user_requests_per_hour=100,church_daily_usd=1000,global_daily_usd=10000",
  );
  await db.query(
    "insert into public.sermons(id,church_id,created_by,title,source,scripture) values($1,$2,$3,$4,$5,$6)",
    [
      target,
      church,
      actor,
      syntheticSource.title,
      syntheticSource.source,
      syntheticSource.scripture,
    ],
  );
  const { error } = await user.auth.signInWithPassword({
    email: "admin_a@sermonbridge.example.test",
    password: process.env.TEST_USER_PASSWORD!,
  });
  assert.equal(error, null);
});
after(async () => {
  await db.query(
    "update public.ai_policy set enabled=$1,model=$2,input_usd_per_million=$3,output_usd_per_million=$4,user_requests_per_hour=$5,church_daily_usd=$6,global_daily_usd=$7",
    [
      initialPolicy.enabled,
      initialPolicy.model,
      initialPolicy.input_usd_per_million,
      initialPolicy.output_usd_per_million,
      initialPolicy.user_requests_per_hour,
      initialPolicy.church_daily_usd,
      initialPolicy.global_daily_usd,
    ],
  );
  appendFileSync(".env.local", `\nTEST_AI_SERMON_ID=${target}\n`);
  await db.end();
});
async function source(): Promise<Source> {
  return (await db.query("select * from public.sermons where id=$1", [target]))
    .rows[0];
}
async function plan(
  kind: "analysis" | "translation" = "analysis",
  language: Language = "ko",
): Promise<Plan> {
  const s = await source();
  return {
    source: s,
    model: "gpt-4.1-mini",
    kind,
    language,
    analysis: kind === "translation" ? mockAnalysis(s) : null,
  };
}
const mock: Provider = async (p) => ({
  value:
    p.kind === "analysis"
      ? mockAnalysis(p.source)
      : mockTranslation(p.language, p.source, p.analysis!),
  usage: { input_tokens: 100, output_tokens: 200 },
  response_id: "mock_not_a_real_openai_call",
});
async function job(id: string) {
  return (
    await db.query("select * from public.generation_jobs where id=$1", [id])
  ).rows[0];
}
async function approve() {
  const s = await source();
  const { error } = await user.rpc("review_sermon", {
    target,
    expected_revision: s["revision" as keyof Source],
    decision: "approved",
    note: "합성 검수",
  });
  assert.equal(error, null);
}
test("모의 분석을 실제 작업 테이블과 원고 스냅샷에 저장", async () => {
  const r = await runGeneration(
    worker,
    actor,
    randomUUID(),
    await plan(),
    mock,
  );
  assert.equal(r.status, "succeeded");
  const j = await job(r.id);
  assert.equal(j.source_snapshot.source, syntheticSource.source);
  assert.equal(j.input_tokens, 100);
  assert.equal(j.output_tokens, 200);
  assert.equal(j.usage_known, true);
  assert.equal((await source()).source, syntheticSource.source);
});
test("5개 언어 전체 원고/장면 번역 저장 및 사용자 JWT 재조회", async () => {
  for (const language of languages) {
    const r = await runGeneration(
      worker,
      actor,
      randomUUID(),
      await plan("translation", language),
      mock,
    );
    assert.equal(r.status, "succeeded");
  }
  const { data, error } = await user
    .from("sermon_translations")
    .select("*")
    .eq("sermon_id", target);
  assert.equal(error, null);
  assert.equal(data?.length, 5);
  for (const t of data!) {
    assert.equal(t.paragraphs.length, 3);
    assert.equal(t.scenes.length, 3);
    assert(t.full_text.length > 0);
  }
});
test("같은 요청 키는 네트워크를 재호출하지 않는다", async () => {
  let count = 0;
  const key = randomUUID(),
    p = await plan("translation", "en");
  const provider: Provider = async (p) => {
    count++;
    return mock(p, 12000);
  };
  const a = await runGeneration(worker, actor, key, p, provider);
  const b = await runGeneration(worker, actor, key, p, provider);
  assert.equal(a.id, b.id);
  assert.equal(count, 1);
});
test("처리 중 중복 언어 작업을 DB가 차단한다", async () => {
  let release!: () => void, start!: () => void;
  const started = new Promise<void>((r) => (start = r)),
    wait = new Promise<void>((r) => (release = r));
  const p = await plan("translation", "ja");
  const first = runGeneration(worker, actor, randomUUID(), p, async (p) => {
    start();
    await wait;
    return mock(p, 12000);
  });
  await started;
  try {
    await assert.rejects(
      runGeneration(worker, actor, randomUUID(), p, mock),
      /DUPLICATE_JOB/,
    );
  } finally {
    release();
  }
  assert.equal((await first).status, "succeeded");
});
test("API 실패는 원고를 보존하고 새 요청으로 복구된다", async () => {
  const p = await plan("translation", "vi");
  const failed = await runGeneration(
    worker,
    actor,
    randomUUID(),
    p,
    async () => {
      throw new Error("합성 네트워크 오류");
    },
  );
  const j = await job(failed.id);
  assert.equal(j.status, "failed");
  assert.equal(j.usage_known, false);
  assert.equal(j.accounted_usd, j.reserved_usd);
  assert.equal((await source()).source, syntheticSource.source);
  assert.equal(
    (await runGeneration(worker, actor, randomUUID(), p, mock)).status,
    "succeeded",
  );
});
test("잘못된 근거 결과는 저장하지 않고 실제 사용량만 기록한다", async () => {
  const before = (await source()).analysis_version;
  const r = await runGeneration(
    worker,
    actor,
    randomUUID(),
    await plan(),
    async () => {
      const a = mockAnalysis();
      a.scenes[0].evidence[0].quote = "원고에 없는 문장";
      return {
        value: a,
        usage: { input_tokens: 5, output_tokens: 5 },
        response_id: "mock_invalid",
      };
    },
  );
  assert.equal((await job(r.id)).failure_code, "INVALID_OUTPUT");
  assert.equal((await source()).analysis_version, before);
});
test("번역 재생성 후 목회자 승인 상태가 해제된다", async () => {
  await approve();
  assert.equal(
    (await db.query("select status from public.sermons where id=$1", [target]))
      .rows[0].status,
    "approved",
  );
  await runGeneration(
    worker,
    actor,
    randomUUID(),
    await plan("translation", "zh-CN"),
    mock,
  );
  assert.equal(
    (await db.query("select status from public.sermons where id=$1", [target]))
      .rows[0].status,
    "draft",
  );
});
test("사용자가 작업 완료나 비용을 직접 조작할 수 없다", async () => {
  const { error } = await user.rpc("finish_generation", {
    job_id: randomUUID(),
    payload: {},
    used_input: 0,
    used_output: 0,
    reason: null,
    provider_response: null,
  });
  assert.equal(error?.code, "42501");
  const edited = await user
    .from("generation_jobs")
    .update({ accounted_usd: 0 })
    .eq("sermon_id", target);
  assert.equal(edited.error?.code, "42501");
});
test("다른 교회 요청자와 조회를 차단한다", async () => {
  await assert.rejects(
    runGeneration(
      worker,
      process.env.TEST_ADMIN_B_ID!,
      randomUUID(),
      await plan(),
      mock,
    ),
    /ACCESS_DENIED/,
  );
  const b = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  await b.auth.signInWithPassword({
    email: "admin_b@sermonbridge.example.test",
    password: process.env.TEST_USER_PASSWORD!,
  });
  for (const table of [
    "generation_jobs",
    "sermon_analyses",
    "sermon_translations",
  ]) {
    const { data, error } = await b
      .from(table)
      .select("*")
      .eq("sermon_id", target);
    assert.equal(error, null);
    assert.deepEqual(data, []);
  }
});
test("media 최종 승인을 계속 차단한다", async () => {
  const c = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  await c.auth.signInWithPassword({
    email: "media_a@sermonbridge.example.test",
    password: process.env.TEST_USER_PASSWORD!,
  });
  const { error } = await c.rpc("review_sermon", {
    target,
    expected_revision: 1,
    decision: "approved",
    note: "",
  });
  assert.equal(error?.code, "42501");
});
test("요청별 비용 한도는 API 호출 전에 적용된다", async () => {
  let count = 0;
  await db.query("update public.ai_policy set max_job_usd=0.000001");
  try {
    await assert.rejects(
      runGeneration(worker, actor, randomUUID(), await plan(), async (p) => {
        count++;
        return mock(p, 12000);
      }),
      /BUDGET_LIMIT/,
    );
    assert.equal(count, 0);
  } finally {
    await db.query("update public.ai_policy set max_job_usd=0.50");
  }
});
test("사용자별 시간당 요청 한도를 적용한다", async () => {
  await db.query("update public.ai_policy set user_requests_per_hour=1");
  try {
    await assert.rejects(
      runGeneration(worker, actor, randomUUID(), await plan(), mock),
      /RATE_LIMIT/,
    );
  } finally {
    await db.query("update public.ai_policy set user_requests_per_hour=100");
  }
});
test("병렬 언어 요청이 전역 비용 예약을 초과하지 않는다", async () => {
  let release!: () => void, start!: () => void;
  const begun = new Promise<void>((r) => (start = r)),
    wait = new Promise<void>((r) => (release = r));
  const p = await plan("translation", "en");
  const reserve = (inputBound(p) + 12000 * 5) / 1e6;
  const sum = Number(
    (
      await db.query(
        "select coalesce(sum(accounted_usd),0) as total from public.generation_jobs where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'",
      )
    ).rows[0].total,
  );
  await db.query("update public.ai_policy set global_daily_usd=$1", [
    sum + reserve * 1.5,
  ]);
  const first = runGeneration(worker, actor, randomUUID(), p, async (p) => {
    start();
    await wait;
    return mock(p, 12000);
  });
  await begun;
  try {
    await assert.rejects(
      runGeneration(
        worker,
        actor,
        randomUUID(),
        await plan("translation", "vi"),
        mock,
      ),
      /BUDGET_LIMIT/,
    );
  } finally {
    release();
    await first;
    await db.query("update public.ai_policy set global_daily_usd=10000");
  }
});
test("만료 작업은 실패로 정리하고 미확인 비용을 유지한다", async () => {
  const p = await plan("translation", "ja");
  const { data: j, error } = await worker.rpc("begin_generation", {
    target,
    actor,
    job_kind: p.kind,
    job_language: p.language,
    idempotency_key: randomUUID(),
    expected_source: p.source.source_version,
    expected_analysis: p.source.analysis_version,
    model_name: p.model,
    input_bound: inputBound(p),
  });
  assert.equal(error, null);
  await db.query(
    "update public.generation_jobs set deadline=now()-interval '1 minute' where id=$1",
    [j.id],
  );
  await worker.rpc("expire_generation_jobs");
  const expired = await job(j.id);
  assert.equal(expired.status, "failed");
  assert.equal(expired.accounted_usd, expired.reserved_usd);
});
test("처리 중 원고가 바뀌면 결과를 덮어쓰지 않는다", async () => {
  const r = await runGeneration(
    worker,
    actor,
    randomUUID(),
    await plan(),
    async (p) => {
      await db.query("update public.sermons set source=$1 where id=$2", [
        syntheticSource.source + "\n담당자가 추가한 합성 문단",
        target,
      ]);
      return mock(p, 12000);
    },
  );
  assert.equal((await job(r.id)).failure_code, "STALE_SOURCE");
  assert((await source()).source.endsWith("담당자가 추가한 합성 문단"));
});
