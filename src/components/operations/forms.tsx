"use client";
import { useActionState, useState } from "react";
import {
  login,
  logout,
  saveSermon,
  reviewSermon,
  manageMembership,
  type ActionResult,
} from "@/app/operations/actions";
import { validTextFile, MAX_SOURCE } from "@/lib/demo";
const initial: ActionResult = {};
function Feedback({ state }: { state: ActionResult }) {
  return (
    <p role={state.error ? "alert" : "status"}>
      {state.error || state.success}
    </p>
  );
}
export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="card narrow">
      <h1>교회 담당자 로그인</h1>
      <p>
        등록된 이메일과 비밀번호로 로그인하세요. 계정과 교회 권한은 담당
        관리자가 승인합니다.
      </p>
      <label htmlFor="email">이메일</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        maxLength={254}
      />
      <label htmlFor="password">비밀번호</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
      />
      <button disabled={pending}>{pending ? "로그인 중…" : "로그인"}</button>
      <Feedback state={state} />
    </form>
  );
}
export type ChurchChoice = { id: string; name: string };
export type SavedSermon = {
  source_version: number;
  analysis_version: number;
  review_requested_at: string | null;
  id: string;
  church_id: string;
  title: string;
  source: string;
  scripture: string;
  status: string;
  revision: number;
  updated_at: string;
};
export function SermonForm({
  churches,
  sermon,
}: {
  churches: ChurchChoice[];
  sermon?: SavedSermon;
}) {
  const [state, action, pending] = useActionState(saveSermon, initial);
  const [source, setSource] = useState(sermon?.source ?? "");
  const [uploadError, setUploadError] = useState("");
  return (
    <form action={action} className="card">
      {sermon && (
        <>
          <input type="hidden" name="id" value={sermon.id} />
          <input type="hidden" name="revision" value={sermon.revision} />
        </>
      )}
      <label htmlFor="church">교회</label>
      {sermon ? (
        <>
          <input type="hidden" name="church_id" value={sermon.church_id} />
          <p>{churches.find((c) => c.id === sermon.church_id)?.name}</p>
        </>
      ) : (
        <select id="church" name="church_id" required>
          {churches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <label htmlFor="title">설교 제목</label>
      <input
        name="title"
        id="title"
        defaultValue={sermon?.title}
        maxLength={120}
        required
      />
      <label htmlFor="scripture">성경 본문</label>
      <input
        name="scripture"
        id="scripture"
        defaultValue={sermon?.scripture}
        maxLength={200}
      />
      <label htmlFor="upload">TXT 파일 가져오기 (UTF-8, 최대 80KB)</label>
      <input
        id="upload"
        type="file"
        accept=".txt,text/plain"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            if (!validTextFile(f.name, f.size)) throw new Error();
            const text = await f.text();
            if (
              text.length > MAX_SOURCE ||
              text.includes("\u0000") ||
              text.includes("\ufffd")
            )
              throw new Error();
            setSource(text);
            setUploadError("");
          } catch {
            setUploadError("UTF-8 TXT 파일과 20,000자 제한을 확인해 주세요.");
          }
        }}
      />
      <p role="alert">{uploadError}</p>
      <label htmlFor="source">설교 원고</label>
      <textarea
        id="source"
        name="source"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        maxLength={MAX_SOURCE}
        rows={14}
        required
      />
      <p className="muted">
        교회 내부 비공개 저장 · 내용 수정 시 승인이 해제됩니다. AI로 전송하지
        않습니다.
      </p>
      <button disabled={pending || !churches.length}>
        {pending ? "저장 중…" : "원고 저장"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function ReviewForm({ sermon }: { sermon: SavedSermon }) {
  const [state, action, pending] = useActionState(reviewSermon, initial);
  return (
    <form action={action} className="card">
      <h2>검수 결정</h2>
      <input type="hidden" name="target" value={sermon.id} />
      <input type="hidden" name="expected_revision" value={sermon.revision} />
      <label htmlFor="decision">검수 상태</label>
      <select id="decision" name="decision">
        <option value="approved">최종 승인 (교회 내부)</option>
        <option value="reopened">승인 해제 / 재검수</option>
      </select>
      <label htmlFor="note">검수 메모</label>
      <textarea id="note" name="note" maxLength={2000} />
      <button disabled={pending}>
        {pending ? "저장 중…" : "검수 결정 저장"}
      </button>
      <Feedback state={state} />
      <p>
        승인은 이 버전의 원고에만 적용됩니다. 현재 단계에서는 승인 후에도 외부
        공개하지 않습니다.
      </p>
    </form>
  );
}
export function MembershipForm({ churches }: { churches: ChurchChoice[] }) {
  const [state, action, pending] = useActionState(manageMembership, initial);
  return (
    <form action={action} className="card">
      <h2>구성원 등록·권한 변경</h2>
      <label htmlFor="target-church">관리할 교회</label>
      <select id="target-church" name="target_church">
        {churches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label htmlFor="target-user">사용자 UUID</label>
      <input
        id="target-user"
        name="target_user"
        required
        placeholder="등록된 계정의 UUID"
      />
      <p>
        계정을 먼저 등록한 후 사용자가 대시보드에서 확인한 UUID를 입력하세요.
      </p>
      <label htmlFor="role">역할</label>
      <select id="role" name="new_role">
        <option value="media">media · 자료 담당자</option>
        <option value="pastor">pastor · 목회자 (승인 가능)</option>
        <option value="admin">admin · 교회 관리자 (권한 관리·승인 가능)</option>
      </select>
      <label htmlFor="active">활성 상태</label>
      <select id="active" name="is_active">
        <option value="true">활성</option>
        <option value="false">접근 중지</option>
      </select>
      <button disabled={pending}>
        {pending ? "저장 중…" : "구성원 권한 저장"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function LogoutForm() {
  const [state, action, pending] = useActionState(logout, initial);
  return (
    <form action={action}>
      <button className="secondary" disabled={pending}>
        {pending ? "로그아웃 중…" : "로그아웃"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
