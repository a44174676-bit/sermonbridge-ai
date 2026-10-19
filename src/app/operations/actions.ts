"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
export type ActionResult = { error?: string; success?: string };
const uuid = z.string().uuid();
const sermonInput = z.object({
  title: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(20000),
  scripture: z.string().trim().max(200),
  church_id: uuid,
});
export async function login(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!supabaseConfig())
    return {
      error: "현재는 데모 모드입니다. 운영 로그인을 사용할 수 없습니다.",
    };
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "이메일과 비밀번호를 확인해 주세요." };
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error)
    return {
      error:
        "로그인하지 못했습니다. 이메일·비밀번호 또는 계정 승인 상태를 확인해 주세요. 반복 시 잠시 후 다시 시도하세요.",
    };
  redirect("/dashboard");
}
export async function logout(): Promise<ActionResult> {
  if (!supabaseConfig()) redirect("/demo");
  const db = await supabaseServer();
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error)
    return {
      error: "로그아웃하지 못했습니다. 연결을 확인한 후 다시 시도하세요.",
    };
  revalidatePath("/", "layout");
  redirect("/login");
}
export async function saveSermon(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!supabaseConfig())
    return { error: "데모에서는 운영 자료를 저장할 수 없습니다." };
  const { db, user } = await requireUser();
  const parsed = sermonInput.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "제목 1~120자, 원고 1~20,000자와 교회를 확인해 주세요." };
  const { data: membership } = await db
    .from("church_memberships")
    .select("church_id")
    .eq("church_id", parsed.data.church_id)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!membership)
    return { error: "이 교회의 활성 구성원만 저장할 수 있습니다." };
  const id = form.get("id");
  let saved: string | undefined;
  if (id) {
    if (!uuid.safeParse(id).success)
      return { error: "잘못된 설교 주소입니다." };
    const revision = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(form.get("revision"));
    if (!revision.success) return { error: "원고를 다시 열어 주세요." };
    const { title, source, scripture } = parsed.data;
    const { data, error } = await db
      .from("sermons")
      .update({ title, source, scripture })
      .eq("id", id)
      .eq("church_id", parsed.data.church_id)
      .eq("revision", revision.data)
      .select("id")
      .maybeSingle();
    if (error || !data)
      return {
        error:
          "저장하지 못했습니다. 권한이 없거나 다른 담당자가 수정했습니다. 새로고침 후 확인하세요.",
      };
    saved = data.id;
  } else {
    const { data, error } = await db
      .from("sermons")
      .insert(parsed.data)
      .select("id")
      .single();
    if (error || !data)
      return {
        error: "저장하지 못했습니다. 교회 권한과 연결 상태를 확인해 주세요.",
      };
    saved = data.id;
  }
  revalidatePath("/dashboard");
  revalidatePath(`/sermons/${saved}`);
  revalidatePath(`/sermons/${saved}/review`);
  redirect(`/sermons/${saved}`);
}
export async function reviewSermon(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!supabaseConfig())
    return { error: "데모에서는 운영 자료를 승인할 수 없습니다." };
  const { db } = await requireUser();
  const parsed = z
    .object({
      target: uuid,
      expected_revision: z.coerce.number().int().positive(),
      decision: z.enum(["approved", "reopened"]),
      note: z.string().max(2000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "검수 입력값을 확인해 주세요." };
  const { error } = await db.rpc("review_sermon", parsed.data);
  if (error)
    return {
      error:
        "승인 권한이 없거나 원고가 변경되었습니다. 페이지를 새로고침하고 다시 확인하세요.",
    };
  revalidatePath("/dashboard");
  revalidatePath(`/sermons/${parsed.data.target}`);
  revalidatePath(`/sermons/${parsed.data.target}/review`);
  return { success: "검수 상태를 저장했습니다. 외부 공개는 하지 않습니다." };
}
export async function manageMembership(
  _state: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!supabaseConfig())
    return { error: "데모에서는 권한을 변경할 수 없습니다." };
  const { db } = await requireUser();
  const parsed = z
    .object({
      target_church: uuid,
      target_user: uuid,
      new_role: z.enum(["admin", "pastor", "media"]),
      is_active: z.enum(["true", "false"]).transform((v) => v === "true"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "교회, 사용자 UUID, 역할과 활성 상태를 확인해 주세요." };
  const { error } = await db.rpc("manage_membership", parsed.data);
  if (error)
    return {
      error:
        "권한을 변경하지 못했습니다. 관리자 권한·사용자 UUID를 확인하세요. 마지막 관리자는 해제할 수 없습니다.",
    };
  revalidatePath("/members");
  return { success: "교회 구성원의 권한을 변경했습니다." };
}
