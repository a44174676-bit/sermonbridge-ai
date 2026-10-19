"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { aiReady, productionProvider, workerClient } from "@/lib/ai/server";
import { runGeneration, errorMessages, errorCode } from "@/lib/ai/engine";
import { analysisSchema, languages, type Source } from "@/lib/ai/schema";
import { validateAnalysis, validateTranslation } from "@/lib/ai/grounding";
import type { ActionResult } from "./actions";
import { supabaseConfig } from "@/lib/supabase/config";
const request = z.object({
  target: z.string().uuid(),
  kind: z.enum(["analysis", "translation"]),
  language: z.enum(languages),
  request_key: z.string().uuid(),
});
export async function generateSermon(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!aiReady()) return { error: errorMessages.AI_NOT_CONFIGURED };
  const parsed = request.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "작업 요청을 확인해 주세요." };
  const { db, user } = await requireUser();
  const { data: source } = await db
    .from("sermons")
    .select("id,title,source,scripture,source_version,analysis_version")
    .eq("id", parsed.data.target)
    .maybeSingle();
  if (!source) return { error: errorMessages.ACCESS_DENIED };
  const { data: row } = await db
    .from("sermon_analyses")
    .select("data,source_version")
    .eq("sermon_id", source.id)
    .maybeSingle();
  if (
    parsed.data.kind === "translation" &&
    (!row || row.source_version !== source.source_version)
  )
    return { error: errorMessages.ANALYSIS_REQUIRED };
  try {
    const result = await runGeneration(
      workerClient(),
      user.id,
      parsed.data.request_key,
      {
        kind: parsed.data.kind,
        language: parsed.data.kind === "analysis" ? "ko" : parsed.data.language,
        source: source as Source,
        analysis: row ? analysisSchema.parse(row.data) : null,
        model: process.env.OPENAI_MODEL!,
      },
      productionProvider(),
    );
    refresh(source.id);
    return result.status === "succeeded"
      ? { success: "생성 결과를 저장했습니다. 목회자 검수가 필요합니다." }
      : {
          error:
            "작업을 완료하지 못했습니다. 작업 기록에서 이유를 확인하고 재시도하세요.",
        };
  } catch (e) {
    return { error: errorMessages[errorCode(e)] ?? errorMessages.API_ERROR };
  }
}
export async function editGenerated(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!supabaseConfig())
    return { error: "데모에서는 운영 자료를 변경할 수 없습니다." };
  const parsed = z
    .object({
      target: z.string().uuid(),
      kind: z.enum(["analysis", "translation"]),
      language: z.enum(languages),
      revision: z.coerce.number().int().positive(),
      payload: z.string().max(200000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "편집 입력값을 확인해 주세요." };
  const { db, user } = await requireUser();
  const { data: source } = await db
    .from("sermons")
    .select("id,title,source,scripture,source_version,analysis_version")
    .eq("id", parsed.data.target)
    .maybeSingle();
  if (!source) return { error: errorMessages.ACCESS_DENIED };
  try {
    const raw = JSON.parse(parsed.data.payload);
    const { data: a } = await db
      .from("sermon_analyses")
      .select("data")
      .eq("sermon_id", source.id)
      .single();
    const value =
      parsed.data.kind === "analysis"
        ? validateAnalysis(raw, source, false)
        : validateTranslation(
            raw,
            source,
            analysisSchema.parse(a?.data),
            parsed.data.language,
          );
    const { error } = await workerClient().rpc("edit_generated", {
      target: source.id,
      actor: user.id,
      expected_revision: parsed.data.revision,
      kind: parsed.data.kind,
      lang: parsed.data.language,
      payload: value,
    });
    if (error)
      return {
        error:
          "변경 내용을 저장하지 못했습니다. 권한·원고 버전·서버 설정을 확인하세요.",
      };
    refresh(source.id);
    return {
      success: "변경사항을 저장하고 승인을 해제했습니다. 다시 검수해 주세요.",
    };
  } catch {
    return {
      error:
        "구조·원문 근거·용어 또는 문단 검증에 실패했습니다. 서버 편집 연결 설정도 확인해 주세요.",
    };
  }
}
export async function requestReview(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!supabaseConfig())
    return { error: "운영 모드에서만 검수를 요청할 수 있습니다." };
  const { db } = await requireUser();
  const parsed = z
    .object({
      target: z.string().uuid(),
      revision: z.coerce.number().int().positive(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "원고를 다시 열어 주세요." };
  const { error } = await db.rpc("request_sermon_review", {
    target: parsed.data.target,
    expected_revision: parsed.data.revision,
  });
  if (error)
    return {
      error: "검수 요청에 실패했습니다. 원고 버전과 권한을 확인하세요.",
    };
  refresh(parsed.data.target);
  return {
    success:
      "검수를 요청했습니다. 목회자 또는 관리자에게 확인을 요청해 주세요.",
  };
}
export async function recoverJobs(): Promise<void> {
  if (!supabaseConfig()) return;
  await requireUser();
  await workerClient().rpc("expire_generation_jobs");
  revalidatePath("/sermons", "layout");
}
function refresh(id: string) {
  revalidatePath(`/sermons/${id}`);
  revalidatePath(`/sermons/${id}/review`);
  revalidatePath("/dashboard");
}
