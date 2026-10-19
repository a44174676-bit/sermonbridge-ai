import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { aiReady } from "@/lib/ai/server";
import {
  analysisSchema,
  translationSchema,
  type Source,
  type Language,
} from "@/lib/ai/schema";
import { inputBound } from "@/lib/ai/provider";
import { paragraphs } from "@/lib/ai/grounding";
import { errorMessages } from "@/lib/ai/engine";
import {
  AnalysisEditor,
  GenerationControls,
  JobPolling,
  RequestReview,
  TranslationTabs,
} from "./controls";
export default async function AIWorkspace({
  source,
  revision,
}: {
  source: Source;
  revision: number;
}) {
  const { db } = await requireUser();
  const [a, t, j, p] = await Promise.all([
    db
      .from("sermon_analyses")
      .select("*")
      .eq("sermon_id", source.id)
      .maybeSingle(),
    db.from("sermon_translations").select("*").eq("sermon_id", source.id),
    db
      .from("generation_jobs")
      .select(
        "id,kind,language,status,estimated_input_tokens,max_output_tokens,input_tokens,output_tokens,usage_known,reserved_usd,accounted_usd,failure_code,created_at",
      )
      .eq("sermon_id", source.id)
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("ai_policy").select("*").single(),
  ]);
  if (a.error || t.error || j.error || p.error)
    return (
      <div className="notice">
        AI 작업 정보를 불러오지 못했습니다. Phase 2B 마이그레이션과 연결 상태를
        확인하세요. 원본 원고 저장은 계속 사용할 수 있습니다.
      </div>
    );
  const parsed = analysisSchema.safeParse(a.data?.data),
    analysis = parsed.success ? parsed.data : null;
  const policy = p.data;
  let analysisEstimate = "—",
    translationEstimate = "—";
  let ps: ReturnType<typeof paragraphs> = [];
  try {
    ps = paragraphs(source.source);
    const estimate = (kind: "analysis" | "translation") =>
      (
        (inputBound({
          kind,
          language: "en",
          model: policy.model,
          source,
          analysis: kind === "translation" ? analysis : null,
        }) *
          Number(policy.input_usd_per_million) +
          policy.max_output_tokens * Number(policy.output_usd_per_million)) /
        1e6
      ).toFixed(4);
    analysisEstimate = estimate("analysis");
    translationEstimate = estimate("translation");
  } catch {
    /* Oversized source is rejected before a paid call. */
  }
  const values = (t.data ?? []).map((r) => ({
    row: r,
    value: translationSchema.safeParse({
      language: r.language,
      paragraphs: r.paragraphs,
      scenes: r.scenes,
    }),
  }));
  return (
    <section>
      <h2>AI 분석·5개 언어 자료</h2>
      <GenerationControls
        target={source.id}
        initialKey={randomUUID()}
        ready={
          aiReady() &&
          policy.enabled &&
          policy.model === process.env.OPENAI_MODEL
        }
        hasAnalysis={Boolean(
          analysis && a.data?.source_version === source.source_version,
        )}
        analysisEstimate={analysisEstimate}
        translationEstimate={translationEstimate}
      />
      <JobPolling
        running={Boolean(j.data?.some((job) => job.status === "running"))}
      />
      <details className="card">
        <summary>언어별 작업·사용량 기록 ({j.data?.length ?? 0})</summary>
        {j.data?.map((job) => (
          <article key={job.id}>
            <h3>
              {job.kind === "analysis" ? "분석" : "번역"} · {job.language} ·{" "}
              {
                { running: "진행 중", succeeded: "저장 완료", failed: "실패" }[
                  job.status as string
                ]
              }
            </h3>
            <p>
              예상 입력 상한 {job.estimated_input_tokens} / 출력 상한{" "}
              {job.max_output_tokens} 토큰 · 예약 $
              {Number(job.reserved_usd).toFixed(4)}
            </p>
            <p>
              {job.usage_known
                ? `실제 입력 ${job.input_tokens} / 출력 ${job.output_tokens} 토큰`
                : "실제 사용량 확인 전 · 예약 비용 유지"}{" "}
              · 반영 비용 ${Number(job.accounted_usd).toFixed(4)}
            </p>
            {job.failure_code && (
              <p>
                {errorMessages[job.failure_code] ??
                  "응답 처리에 실패했습니다. 설정과 작업 상태를 확인해 주세요."}
              </p>
            )}
          </article>
        ))}
      </details>
      {analysis && (
        <>
          {a.data?.source_version !== source.source_version && (
            <div className="notice">
              이 분석은 이전 원고의 결과입니다. 다시 분석해 주세요.
            </div>
          )}
          <AnalysisEditor
            key={a.data?.updated_at}
            data={analysis}
            target={source.id}
            revision={revision}
            disabled={a.data?.source_version !== source.source_version}
          />
        </>
      )}
      <TranslationTabs
        target={source.id}
        revision={revision}
        sourceParagraphs={ps}
        translations={values.flatMap((r) =>
          r.value.success ? [r.value.data] : [],
        )}
        staleLanguages={values
          .filter(
            (r) =>
              r.row.source_version !== source.source_version ||
              r.row.analysis_version !== source.analysis_version,
          )
          .map((r) => r.row.language as Language)}
      />
      <RequestReview target={source.id} revision={revision} />
    </section>
  );
}
