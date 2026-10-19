"use client";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const pathname = usePathname();
  const target =
    typeof href === "string" &&
    (pathname.startsWith("/demo") || pathname === "/s/demo")
      ? `/demo${href === "/" ? "" : href}`
      : href;
  return <NextLink href={target} {...props} />;
}
import { useEffect, useState } from "react";
import {
  demo,
  sessionSchema,
  MAX_SOURCE,
  validateSource,
  validTextFile,
  type Language,
  type Sermon,
} from "@/lib/demo";
const storageKey = "sermonbridge-phase1-v1";
const labels = {
  ko: { prev: "이전 장면", next: "다음 장면", term: "성경 용어 설명" },
  en: { prev: "Previous", next: "Next", term: "Bible glossary" },
  vi: { prev: "Trước", next: "Tiếp", term: "Giải thích thuật ngữ" },
};
export default function DemoApp({ route }: { route: string }) {
  const [sermon, setSermon] = useState<Sermon>(demo);
  const [local, setLocal] = useState<Sermon | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState<Language>("ko");
  const [size, setSize] = useState(20);
  const [scene, setScene] = useState(0);
  const [checked, setChecked] = useState(false);
  const isLocal = route.includes("/local");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const value = sessionSchema.parse(
          JSON.parse(raw),
        ); /* eslint-disable-next-line react-hooks/set-state-in-effect -- Restore tab-local demo data after hydration. */
        setSermon(value.demo);
        setLocal(value.local);
      }
    } catch {
      setMessage("저장된 데모를 읽지 못했습니다. 새로 시작합니다.");
    }
    setReady(true);
  }, []);
  const active = isLocal ? local : sermon;
  function save(next: Sermon, localTarget = isLocal) {
    const value = {
      demo: localTarget ? sermon : next,
      local: localTarget ? next : local,
    };
    if (localTarget) setLocal(next);
    else setSermon(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
      setMessage("이 탭에 데모 변경사항을 저장했습니다.");
    } catch {
      setMessage(
        "브라우저 저장 공간을 사용할 수 없어 새로고침하면 변경사항이 사라집니다.",
      );
    }
  }
  const id = isLocal ? "local" : "demo";
  const viewer = route.startsWith("/s/");
  const present = route.startsWith("/present/");
  return (
    <>
      <a className="skip" href="#main">
        본문 바로가기
      </a>
      <header>
        <Link className="brand" href="/">
          SermonBridge <span>AI</span>
        </Link>
        <nav aria-label="주 메뉴">
          <Link href="/dashboard">설교 관리</Link>
          <Link href="/s/demo">모바일 체험</Link>
          <Link href="/login">로그인</Link>
        </nav>
      </header>
      <div className="demo-bar">
        <strong>DEMO MODE</strong> · 실제 인증·AI 생성·외부 공개가 없는 체험
        화면입니다. 개인정보나 비공개 원고를 입력하지 마세요.
      </div>
      <main id="main" className={present ? "presentation" : ""}>
        <p role="status" className="status">
          {message}
        </p>
        {route === "/" && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">언어를 넘어, 함께 이해하는 말씀</p>
                <h1>
                  같은 말씀을
                  <br />
                  각자의 언어로.
                </h1>
                <p className="lead">
                  외국인 이웃과 새신자가 설교를 이해하도록.
                  <br />
                  목회자의 메시지를 쉬운 설명과 다국어 자료로 연결합니다.
                </p>
                <div className="actions">
                  <Link className="button" href="/dashboard">
                    샘플 설교로 시작하기 →
                  </Link>
                  <Link className="button secondary" href="/s/demo">
                    참석자 화면 체험
                  </Link>
                </div>
                <p className="muted">한국어 · English · Tiếng Việt</p>
              </div>
              <div className="hero-card">
                <span className="badge">주일 예배 · 테스트 자료</span>
                <h2>{demo.title}</h2>
                <p>사사기 4:14–21</p>
                <Illustration index={0} />
                <p>
                  말씀을 읽고, 장면을 살펴보고,
                  <br />
                  나의 언어로 천천히 이해해요.
                </p>
              </div>
            </section>
            <section className="grid">
              <article className="card">
                <h2>01 원고 준비</h2>
                <p>제목과 원고를 입력하고 내용을 확인합니다.</p>
              </article>
              <article className="card">
                <h2>02 담당자 검수</h2>
                <p>
                  번역과 설명을 확인합니다. 실제 AI 연결은 다음 단계에서
                  제공됩니다.
                </p>
              </article>
              <article className="card">
                <h2>03 함께 읽기</h2>
                <p>큰 화면과 모바일에서 언어별 샘플 자료를 읽어 보세요.</p>
              </article>
            </section>
          </>
        )}
        {route === "/login" && (
          <section className="narrow card">
            <p className="eyebrow">교회 담당자</p>
            <h1>로그인</h1>
            <p>
              실제 로그인과 교회 관리자 승인은 아직 연결되지 않았습니다.
              데모에서는 계정 없이 샘플만 체험합니다.
            </p>
            <Link className="button" href="/dashboard">
              계정 없이 데모 체험
            </Link>
            <p className="muted">비밀번호나 개인 정보를 수집하지 않습니다.</p>
          </section>
        )}
        {route === "/dashboard" && (
          <>
            <div className="heading">
              <div>
                <p className="eyebrow">교회 담당자 · 데모 작업 공간</p>
                <h1>설교 관리</h1>
                <p>말씀을 준비하고, 확인하고, 함께 나누세요.</p>
              </div>
              <Link className="button" href="/sermons/new">
                ＋ 설교 등록 체험
              </Link>
            </div>
            <div className="notice">
              샘플은 2026년 10월 18일 예배의 테스트용 요약입니다. 실제 목사님의
              원고가 아닙니다.
            </div>
            <div className="grid">
              {[sermon, ...(local ? [local] : [])].map((item, i) => (
                <article className="card" key={i}>
                  <span className="badge">
                    {item.approved ? "데모 검수 완료" : "검수 대기"} ·{" "}
                    {i ? "직접 입력" : "샘플"}
                  </span>
                  <h2>{item.title}</h2>
                  <p>
                    {i ? "AI 분석 미실행" : "사사기 4:14–21 · 3개 샘플 장면"}
                  </p>
                  <Link
                    className="button secondary"
                    href={`/sermons/${i ? "local" : "demo"}`}
                  >
                    설교 살펴보기 →
                  </Link>
                </article>
              ))}
            </div>
          </>
        )}
        {route === "/sermons/new" && (
          <section className="narrow">
            <p className="eyebrow">STEP 01</p>
            <h1>설교 원고 등록</h1>
            <div className="notice">
              입력한 자료는 이 탭의 세션에만 저장됩니다. 실제 AI 분석을 실행하지
              않습니다. 탭을 닫으면 자료가 사라질 수 있습니다.
            </div>
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const title = String(data.get("title"));
                const source = String(data.get("source"));
                const error = validateSource(title, source);
                if (error) {
                  setMessage(error);
                  return;
                }
                save({ title, source, approved: false, scenes: [] }, true);
                setMessage(
                  "원고를 저장했습니다. 아래에서 등록한 원고를 확인하세요.",
                );
              }}
            >
              <label htmlFor="title">설교 제목</label>
              <input id="title" name="title" required maxLength={120} />
              <label htmlFor="upload">
                TXT 파일 가져오기 (UTF-8, 최대 80KB)
              </label>
              <input
                id="upload"
                type="file"
                accept=".txt,text/plain"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!validTextFile(file.name, file.size)) {
                    setMessage("80KB 이하의 TXT 파일을 선택해 주세요.");
                    return;
                  }
                  const text = await file.text();
                  if (
                    text.includes("\u0000") ||
                    text.includes("\ufffd") ||
                    text.length > MAX_SOURCE
                  ) {
                    setMessage(
                      "UTF-8 텍스트인지, 20,000자 이하인지 확인해 주세요.",
                    );
                    return;
                  }
                  const input = document.getElementById(
                    "source",
                  ) as HTMLTextAreaElement;
                  input.value = text;
                  setMessage("TXT 내용을 불러왔습니다. 확인 후 저장하세요.");
                }}
              />
              <label htmlFor="source">
                원고 또는 테스트 요약 (최대 20,000자)
              </label>
              <textarea
                id="source"
                name="source"
                rows={12}
                maxLength={MAX_SOURCE}
                required
              />
              <button type="submit">데모 원고 저장</button>
              {local && (
                <Link className="button secondary" href="/sermons/local">
                  등록한 원고 확인 →
                </Link>
              )}
            </form>
          </section>
        )}
        {route.startsWith("/sermons/") &&
          route !== "/sermons/new" &&
          (!ready ? (
            <p>자료를 불러오는 중입니다.</p>
          ) : !active ? (
            <section>
              <h1>저장된 원고가 없습니다</h1>
              <Link href="/sermons/new">원고 등록으로 이동</Link>
            </section>
          ) : (
            <>
              <p className="eyebrow">
                {route.endsWith("/review")
                  ? "STEP 02 · 검수 체험"
                  : "설교 자료"}
              </p>
              <h1>{active.title}</h1>
              <p>
                {isLocal
                  ? "직접 입력한 데모 원고 · AI 분석 미실행"
                  : "사사기 4:14–21 · 2026년 10월 18일 · 테스트용 요약"}
              </p>
              <div className="notice">
                {isLocal
                  ? "저장한 원고로 AI 결과를 생성하는 기능은 Phase 2에서 연결됩니다."
                  : "원문, 번역과 설명은 미리 작성한 샘플이며 목회자·언어 전문가의 검수를 받지 않았습니다."}
              </div>
              <section className="card">
                <h2>원문 수정</h2>
                <label htmlFor="edit-source">
                  {isLocal
                    ? "입력한 원고"
                    : "테스트용 요약 — 실제 설교 원고 아님"}
                </label>
                <textarea
                  id="edit-source"
                  rows={6}
                  maxLength={MAX_SOURCE}
                  value={active.source}
                  onChange={(e) =>
                    save({ ...active, source: e.target.value, approved: false })
                  }
                />
                <p className="muted">
                  원문을 바꿔도 기존 샘플 번역은 자동으로 변경되지 않습니다.
                  실제 재생성은 Phase 2에서 지원합니다.
                </p>
              </section>
              {!isLocal && (
                <section className="grid">
                  <article className="card">
                    <h2>원고에 등장한 내용</h2>
                    <p>앞서 행하시는 하나님을 믿고 따라가라.</p>
                    <p>어떤 상황에서도 하나님의 편에 서라.</p>
                    <p>드보라 · 바락 · 시스라 · 야엘</p>
                  </article>
                  <article className="card">
                    <h2>배경 설명 샘플</h2>
                    <p>
                      사사기는 이스라엘의 사사들과 그 시대의 이야기를 담고
                      있습니다.
                    </p>
                    <span className="badge">보충 설명 · 원고의 주장 아님</span>
                  </article>
                  <article className="card">
                    <h2>신학적 검토 항목</h2>
                    <p>
                      본문의 폭력적 장면을 오늘의 행동 지침으로 단순 적용하지
                      않도록 목회자 검토가 필요합니다.
                    </p>
                  </article>
                </section>
              )}
              {active.scenes.map((item, index) => (
                <section className="card scene-edit" key={index}>
                  <Illustration index={index} />
                  <div>
                    <h2>
                      {index + 1}. {item.title}
                    </h2>
                    <p className="muted">교육용 요약·번역 샘플 · AI 미호출</p>
                    {(["ko", "en", "vi"] as const).map((lang) => (
                      <div key={lang}>
                        <label htmlFor={`translation-${index}-${lang}`}>
                          {
                            { ko: "한국어", en: "English", vi: "Tiếng Việt" }[
                              lang
                            ]
                          }
                        </label>
                        <textarea
                          id={`translation-${index}-${lang}`}
                          lang={lang}
                          value={item.text[lang]}
                          maxLength={3000}
                          onChange={(e) => {
                            const scenes = active.scenes.map((s, i) =>
                              i === index
                                ? {
                                    ...s,
                                    text: { ...s.text, [lang]: e.target.value },
                                  }
                                : s,
                            );
                            save({ ...active, scenes, approved: false });
                          }}
                        />
                      </div>
                    ))}
                    <p>이미지 생성·교체는 Phase 3에서 제공합니다.</p>
                  </div>
                </section>
              ))}
              {route.endsWith("/review") ? (
                <section className="card">
                  <h2>최종 검수 체험</h2>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                    />{" "}
                    테스트 자료이며 실제 공개되지 않는다는 점을 확인했습니다.
                  </label>
                  <button
                    disabled={
                      !checked || !active.source.trim() || !active.scenes.length
                    }
                    onClick={() => save({ ...active, approved: true })}
                  >
                    데모 검수 완료로 표시
                  </button>
                  <p>
                    {active.approved
                      ? "데모 검수가 완료되었습니다. 실제 공개 권한에는 영향을 주지 않습니다."
                      : "텍스트를 수정하면 데모 검수 상태가 초기화됩니다."}
                  </p>
                  <Link className="button secondary" href="/s/demo">
                    샘플 모바일 화면 보기
                  </Link>
                </section>
              ) : (
                <div className="actions">
                  <Link className="button" href={`/sermons/${id}/review`}>
                    검수 화면으로 →
                  </Link>
                  {active.scenes.length > 0 && (
                    <Link className="button secondary" href={`/present/${id}`}>
                      프레젠테이션 체험
                    </Link>
                  )}
                </div>
              )}
            </>
          ))}
        {(viewer || present) && (
          <>
            <div className="heading">
              <div>
                <p className="eyebrow">
                  {present
                    ? "예배 프레젠테이션 체험"
                    : "모두를 위한 말씀 · SAMPLE"}
                </p>
                <h1>{demo.title}</h1>
                <p>사사기 4:14–21 · 테스트용 요약 / Sample / Bản mẫu</p>
              </div>
              <div className="controls">
                <label htmlFor="language">언어 / Language</label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                >
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
                <div className="actions">
                  <button
                    className="secondary"
                    aria-label="글자 작게"
                    disabled={size <= 16}
                    onClick={() => setSize(size - 2)}
                  >
                    A−
                  </button>
                  <button
                    className="secondary"
                    aria-label="글자 크게"
                    disabled={size >= 32}
                    onClick={() => setSize(size + 2)}
                  >
                    A＋
                  </button>
                </div>
              </div>
            </div>
            <div className="notice">
              수동 읽기 모드 · 기기 간 실시간 동기화는 Phase 4에서 제공됩니다.
              이 주소는 공개된 고정 샘플만 보여 줍니다.
            </div>
            <article className="viewer card" lang={language}>
              <Illustration index={scene} />
              <div style={{ fontSize: size }}>
                <p className="eyebrow">
                  {scene + 1} / {demo.scenes.length}
                </p>
                <p className="caption">{sermon.scenes[scene].text[language]}</p>
                <details>
                  <summary>{labels[language].term}</summary>
                  <p>{demo.scenes[scene].term[language]}</p>
                </details>
              </div>
            </article>
            <div className="scene-nav">
              <button
                disabled={scene === 0}
                onClick={() => setScene(scene - 1)}
              >
                {labels[language].prev}
              </button>
              <span aria-live="polite">{scene + 1} / 3</span>
              <button
                disabled={scene === 2}
                onClick={() => setScene(scene + 1)}
              >
                {labels[language].next}
              </button>
            </div>
            {present && (
              <p className="muted">
                브라우저 전체 화면 기능을 사용하세요. PDF·PNG 다운로드는 Phase
                5에서 제공합니다.
              </p>
            )}
          </>
        )}
      </main>
      <footer>
        SermonBridge AI · 함께 이해하는 말씀
        <p>
          Phase 1 UI 데모 · AI·Supabase 미연결 · 실제 예배 자료로 사용하기 전
          검수가 필요합니다.
        </p>
      </footer>
    </>
  );
}
function Illustration({ index }: { index: number }) {
  return (
    <figure className={`illustration illustration-${index}`}>
      <svg
        viewBox="0 0 800 450"
        role="img"
        aria-label="산과 장막으로 구성된 장식용 그래픽. 성경 장면을 재현한 이미지가 아닙니다."
      >
        <circle cx="630" cy="95" r="47" fill="#f4d799" />
        <path
          d="M0 340 220 130 420 340 610 170 800 340V450H0Z"
          fill="#63868c"
        />
        <path d="M0 385 300 255 550 390 800 280V450H0Z" fill="#304f65" />
        <path d="M470 380 570 240 690 380Z" fill="#e2c8a3" />
        <path d="M550 380 574 300 610 380Z" fill="#304058" />
      </svg>
      <figcaption>장식용 그래픽 · 실제 장면 / AI 생성 그림 아님</figcaption>
    </figure>
  );
}
