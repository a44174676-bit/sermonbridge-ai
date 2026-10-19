import AIWorkspace from "@/components/ai/workspace";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, supabaseServer } from "@/lib/supabase/server";
import {
  LoginForm,
  LogoutForm,
  SermonForm,
  ReviewForm,
  MembershipForm,
  type SavedSermon,
} from "./forms";
import type { ReactNode } from "react";
function Frame({
  children,
  authenticated = false,
}: {
  children: ReactNode;
  authenticated?: boolean;
}) {
  return (
    <>
      <a href="#main" className="skip">
        본문 바로가기
      </a>
      <header>
        <Link className="brand" href="/">
          SermonBridge AI
        </Link>
        <nav aria-label="운영 메뉴">
          <Link href="/dashboard">설교 관리</Link>
          <Link href="/members">구성원 관리</Link>
          <Link href="/demo">데모 체험</Link>
          {authenticated ? <LogoutForm /> : <Link href="/login">로그인</Link>}
        </nav>
      </header>
      <div className="demo-bar">
        운영 모드 · 교회 내부 비공개 자료 · AI 결과는 목회자 검수 필요
      </div>
      <main id="main">{children}</main>
      <footer>SermonBridge AI · 공개 기능은 아직 제공하지 않습니다.</footer>
    </>
  );
}
export default async function OperationsApp({ route }: { route: string }) {
  if (route === "/")
    return (
      <Frame>
        <section className="hero">
          <div>
            <p className="eyebrow">교회를 위한 다국어 설교 지원</p>
            <h1>함께 이해하는 말씀</h1>
            <p>원고를 안전하게 보관하고, 교회 담당자와 함께 검수하세요.</p>
            <div className="actions">
              <Link className="button" href="/login">
                담당자 로그인
              </Link>
              <Link className="button secondary" href="/demo">
                샘플로 체험하기
              </Link>
            </div>
          </div>
        </section>
      </Frame>
    );
  if (route === "/login") {
    const db = await supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) redirect("/dashboard");
    return (
      <Frame>
        <LoginForm />
        <p className="narrow">
          비밀번호를 잊으셨거나 계정이 없다면 교회 관리자에게 문의하세요. 셀프
          회원가입·관리자 자동 승인은 제공하지 않습니다.
        </p>
      </Frame>
    );
  }
  // No public operational data endpoint, even for approved sermons, until a separately reviewed publication model exists.
  if (route.startsWith("/s/")) notFound();
  if (
    !["/dashboard", "/sermons/new", "/members"].includes(route) &&
    !/^\/(sermons|present)\/[0-9a-f-]+(\/review)?$/.test(route)
  )
    notFound();
  const { db, user } = await requireUser();
  const [
    { data: churches, error: churchError },
    { data: memberships, error: memberError },
  ] = await Promise.all([
    db.from("churches").select("id,name").order("name"),
    db
      .from("church_memberships")
      .select("church_id,role")
      .eq("user_id", user.id)
      .eq("active", true),
  ]);
  if (churchError || memberError)
    throw new Error("교회 정보를 불러오지 못했습니다.");
  const choices = churches ?? [];
  const own = memberships ?? [];
  if (route === "/dashboard") {
    const { data: sermons, error } = await db
      .from("sermons")
      .select("id,title,status,church_id,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("원고 목록을 불러오지 못했습니다.");
    return (
      <Frame authenticated>
        <div className="heading">
          <div>
            <h1>설교 관리</h1>
            <p>최근 수정한 설교 최대 100개 · 교회 내부 자료</p>
          </div>
          {choices.length > 0 && (
            <Link className="button" href="/sermons/new">
              설교 등록
            </Link>
          )}
        </div>
        <p className="muted">
          내 사용자 UUID: <code>{user.id}</code>
        </p>
        {!choices.length && (
          <div className="notice">
            아직 승인된 교회 소속이 없습니다. 위 UUID를 교회 관리자에게 전달해
            주세요.
          </div>
        )}
        <div className="grid">
          {sermons?.map((s) => (
            <article className="card" key={s.id}>
              <span className="badge">
                {s.status === "approved" ? "내부 승인 완료" : "검수 대기"} ·
                비공개
              </span>
              <h2>{s.title}</h2>
              <p>{choices.find((c) => c.id === s.church_id)?.name}</p>
              <Link className="button secondary" href={`/sermons/${s.id}`}>
                설교 살펴보기
              </Link>
            </article>
          ))}
        </div>
        {choices.length > 0 && !sermons?.length && (
          <p>아직 등록된 설교가 없습니다.</p>
        )}
      </Frame>
    );
  }
  if (route === "/members") {
    const managed = choices.filter((c) =>
      own.some((m) => m.church_id === c.id && m.role === "admin"),
    );
    if (!managed.length)
      return (
        <Frame authenticated>
          <h1>구성원 관리</h1>
          <p>교회 관리자만 구성원 권한을 관리할 수 있습니다.</p>
        </Frame>
      );
    const { data: members, error } = await db
      .from("church_memberships")
      .select("church_id,user_id,role,active")
      .in(
        "church_id",
        managed.map((c) => c.id),
      );
    if (error) throw new Error("구성원을 불러오지 못했습니다.");
    return (
      <Frame authenticated>
        <h1>구성원 관리</h1>
        <MembershipForm churches={managed} />
        <h2>현재 구성원</h2>
        {members?.map((m) => (
          <article className="card" key={`${m.church_id}/${m.user_id}`}>
            <p>
              {managed.find((c) => c.id === m.church_id)?.name} · {m.role} ·{" "}
              {m.active ? "활성" : "접근 중지"}
            </p>
            <code style={{ overflowWrap: "anywhere" }}>{m.user_id}</code>
          </article>
        ))}
      </Frame>
    );
  }
  if (route === "/sermons/new")
    return (
      <Frame authenticated>
        <h1>설교 원고 등록</h1>
        {choices.length ? (
          <SermonForm churches={choices} />
        ) : (
          <p>교회 구성원 승인 후 원고를 등록할 수 있습니다.</p>
        )}
      </Frame>
    );
  const id = route.split("/")[2];
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { data: sermon, error } = await db
    .from("sermons")
    .select(
      "id,church_id,title,source,scripture,status,revision,updated_at,source_version,analysis_version,review_requested_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("원고를 불러오지 못했습니다.");
  if (!sermon) notFound();
  const s = sermon as SavedSermon;
  const review = route.endsWith("/review");
  const role = own.find((m) => m.church_id === s.church_id)?.role;
  return (
    <Frame authenticated>
      <p className="eyebrow">
        {s.scripture || "성경 본문 미입력"} ·{" "}
        {s.status === "approved" ? "내부 승인 완료" : "검수 대기"} · 비공개
      </p>
      <h1>{s.title}</h1>
      {route.startsWith("/present/") ? (
        <>
          <div className="notice">
            운영 프레젠테이션은 다국어 자료 생성 이후 제공됩니다. 원고는
            공개되지 않습니다.
          </div>
          <Link href={`/sermons/${id}`}>원고로 돌아가기</Link>
        </>
      ) : (
        <>
          <SermonForm
            key={`${s.id}/${s.source_version}`}
            churches={choices}
            sermon={s}
          />
          <p>
            AI 결과는 목회자 검수 전 자료입니다. 그림 생성은 이번 단계에서
            제공하지 않습니다.
          </p>
          {s.review_requested_at && (
            <div className="notice">목회자 검수 요청이 등록되었습니다.</div>
          )}
          <AIWorkspace source={s} revision={s.revision} />
          {review ? (
            <>
              {["admin", "pastor"].includes(role ?? "") ? (
                <ReviewForm key={s.revision} sermon={s} />
              ) : (
                <div className="notice">
                  자료 담당자는 원고를 수정할 수 있지만 최종 승인할 수 없습니다.
                  목회자 또는 교회 관리자에게 검수를 요청하세요.
                </div>
              )}
              <ReviewHistory id={id} />
            </>
          ) : (
            <div className="actions">
              <Link className="button" href={`/sermons/${id}/review`}>
                검수 화면
              </Link>
              <Link className="button secondary" href={`/present/${id}`}>
                프레젠테이션 준비 상태
              </Link>
            </div>
          )}
        </>
      )}
    </Frame>
  );
}
async function ReviewHistory({ id }: { id: string }) {
  const { db } = await requireUser();
  const { data, error } = await db
    .from("reviews")
    .select("id,decision,revision,note,created_at")
    .eq("sermon_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return <p>검수 기록을 불러오지 못했습니다.</p>;
  return (
    <section className="card">
      <h2>최근 검수 기록</h2>
      {data?.length ? (
        data.map((r) => (
          <div key={r.id}>
            <strong>
              버전 {r.revision} ·{" "}
              {r.decision === "approved" ? "승인" : "재검수"}
            </strong>
            <p>{r.note || "메모 없음"}</p>
          </div>
        ))
      ) : (
        <p>검수 기록이 없습니다.</p>
      )}
    </section>
  );
}
