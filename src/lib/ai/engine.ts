import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GenerationError,
  inputBound,
  type Plan,
  type Provider,
} from "./provider";
import { validateAnalysis, validateTranslation } from "./grounding";
import type { Usage } from "./schema";
export const errorMessages: Record<string, string> = {
  AI_NOT_CONFIGURED:
    "AI 연결 정보가 없습니다. 샘플 데모를 이용하거나 관리자에게 설정을 요청하세요.",
  AI_POLICY_DISABLED:
    "AI 정책이 비활성화됐거나 모델 설정이 다릅니다. 모델·단가·예산을 확인해 주세요.",
  ACCESS_DENIED: "이 교회 원고에 접근할 권한이 없습니다.",
  DUPLICATE_JOB: "이 언어의 작업이 이미 진행 중입니다.",
  RATE_LIMIT: "시간당 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
  BUDGET_LIMIT: "설정한 비용 상한을 초과하여 호출하지 않았습니다.",
  SOURCE_LIMIT:
    "원고는 20,000자·200개 문단 이하로 입력하세요. 분석을 포함한 요청 크기도 제한됩니다.",
  ANALYSIS_REQUIRED: "현재 원고를 먼저 분석해 주세요.",
  STALE_SOURCE:
    "처리 중 원고 또는 분석이 변경되었습니다. 최신 내용으로 다시 생성해 주세요.",
  EDIT_CONFLICT: "다른 담당자가 내용을 수정했습니다. 새로고침 후 확인하세요.",
  INVALID_OUTPUT:
    "응답의 구조·원문 근거·문단 또는 용어 검증에 실패했습니다. 결과를 저장하지 않았습니다.",
  API_RATE_LIMIT:
    "AI 서비스 요청 한도에 도달했습니다. 잠시 후 새 작업으로 재시도하세요.",
  API_ERROR:
    "AI 서비스 호출에 실패했습니다. 연결과 설정을 확인하고 재시도하세요.",
  TIMEOUT_UNKNOWN_USAGE:
    "처리가 중단되었거나 시간 초과입니다. 비용은 보수적으로 예약액을 유지합니다.",
  MODEL_REFUSAL:
    "모델이 요청을 처리하지 않았습니다. 원고를 검토한 후 다시 시도하세요.",
  INCOMPLETE_RESPONSE:
    "응답이 토큰 한도 내에 완료되지 않았습니다. 원고를 줄이거나 관리자에게 한도 조정을 요청하세요.",
  ACCESS_REVOKED:
    "작업 중 교회 접근 권한이 해제되어 결과를 저장하지 않았습니다.",
  USAGE_BOUND_EXCEEDED:
    "사용량이 예상 상한을 초과하여 추가 생성을 중단했습니다. 관리자가 확인해야 합니다.",
  SAVE_FAILED:
    "결과 저장을 확인하지 못했습니다. 작업 상태를 새로고침하고 중복 호출하지 마세요.",
};
export function errorCode(error: unknown) {
  if (error instanceof GenerationError) return error.code;
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 429
  )
    return "API_RATE_LIMIT";
  if (error instanceof Error && error.message in errorMessages)
    return error.message;
  return "API_ERROR";
}
export async function runGeneration(
  worker: SupabaseClient,
  actor: string,
  requestKey: string,
  plan: Plan,
  provider: Provider,
) {
  const { data: job, error } = await worker.rpc("begin_generation", {
    target: plan.source.id,
    actor,
    job_kind: plan.kind,
    job_language: plan.language,
    idempotency_key: requestKey,
    expected_source: plan.source.source_version,
    expected_analysis: plan.source.analysis_version,
    model_name: plan.model,
    input_bound: inputBound(plan),
  });
  if (error)
    throw new Error(
      errorMessages[error.message] ? error.message : "ACCESS_DENIED",
    );
  if (!job.claimed)
    return { id: job.id as string, status: job.status as string };
  let usage: Usage | null = null;
  let responseId: string | null = null;
  let value: unknown = null;
  let failure: string | null = null;
  try {
    const result = await provider(plan, job.max_output_tokens);
    usage = result.usage;
    responseId = result.response_id;
    try {
      value =
        plan.kind === "analysis"
          ? validateAnalysis(result.value, plan.source)
          : validateTranslation(
              result.value,
              plan.source,
              plan.analysis!,
              plan.language,
            );
    } catch {
      failure = "INVALID_OUTPUT";
    }
  } catch (e) {
    failure = errorCode(e);
    if (e instanceof GenerationError) usage = e.usage;
  }
  const { data: status, error: saveError } = await worker.rpc(
    "finish_generation",
    {
      job_id: job.id,
      payload: value,
      used_input: usage?.input_tokens ?? null,
      used_output: usage?.output_tokens ?? null,
      reason: failure,
      provider_response: responseId,
    },
  );
  if (saveError) throw new Error("SAVE_FAILED");
  return { id: job.id as string, status: status as string };
}
