"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateSermon,
  editGenerated,
  requestReview,
  recoverJobs,
} from "@/app/operations/ai-actions";
import {
  languageLabels,
  languages,
  type Analysis,
  type Language,
  type Translation,
} from "@/lib/ai/schema";
import type { ActionResult } from "@/app/operations/actions";
const initial: ActionResult = {};
function Feedback({ state }: { state: ActionResult }) {
  return (
    <p role={state.error ? "alert" : "status"}>
      {state.error || state.success}
    </p>
  );
}
export function GenerationControls({
  target,
  ready,
  hasAnalysis,
  analysisEstimate,
  translationEstimate,
  initialKey,
}: {
  target: string;
  ready: boolean;
  hasAnalysis: boolean;
  analysisEstimate: string;
  translationEstimate: string;
  initialKey: string;
}) {
  const [state, action, pending] = useActionState(generateSermon, initial);
  const [key, setKey] = useState(initialKey);
  const [kind, setKind] = useState("analysis");
  useEffect(() => {
    // A retry is a new accounted network attempt. Double submission of one form keeps the same key.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKey(crypto.randomUUID());
  }, [state]);
  return (
    <form action={action} className="card">
      <h2>AI 분석·번역 생성</h2>
      <p>
        원고를 OpenAI로 전송합니다. 생성 결과는 검수 전 자료이며 목회자의 해석을
        대신하지 않습니다.
      </p>
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="request_key" value={key} />
      <label htmlFor="job-kind">생성 종류</label>
      <select
        id="job-kind"
        name="kind"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        disabled={pending}
      >
        <option value="analysis">원고 분석 / 다시 분석</option>
        <option value="translation">전체 원고·장면 번역 / 재생성</option>
      </select>
      <label htmlFor="job-language">번역 언어</label>
      <select
        id="job-language"
        name="language"
        defaultValue="en"
        disabled={pending || kind === "analysis"}
      >
        {languages.map((l) => (
          <option value={l} key={l}>
            {languageLabels[l]}
          </option>
        ))}
      </select>
      {kind === "analysis" && (
        <input type="hidden" name="language" value="ko" />
      )}
      <p>
        이번 요청의 예상 최대 비용:{" "}
        <strong>
          ${kind === "analysis" ? analysisEstimate : translationEstimate} USD
        </strong>{" "}
        · 실제 사용량은 작업 기록에 표시됩니다.
      </p>
      <p className="muted">
        각 언어는 별도 작업입니다. 재생성도 비용 한도와 요청 제한에 포함됩니다.
        분석·원고 수정 후 기존 번역은 재생성이 필요합니다.
      </p>
      <button
        disabled={!ready || pending || (kind === "translation" && !hasAnalysis)}
      >
        {pending ? "생성 중… 잠시 기다려 주세요" : "비용 확인 후 생성"}
      </button>
      <Feedback state={state} />
      {!ready && (
        <p>
          AI 키·모델·서버 작업 키 또는 DB 사용 정책이 준비되지 않았습니다. 실제
          호출은 실행하지 않습니다.
        </p>
      )}
    </form>
  );
}
export function JobPolling({ running }: { running: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [running, router]);
  return running ? (
    <div className="notice" role="status">
      생성 작업이 진행 중입니다. 페이지를 다시 열어도 기록을 확인할 수 있습니다.
      3분 이상 멈춘 작업은 아래에서 정리하세요.
      <form action={recoverJobs}>
        <button className="secondary">만료 작업 정리</button>
      </form>
    </div>
  ) : null;
}
export function AnalysisEditor({
  data,
  target,
  revision,
  disabled,
}: {
  data: Analysis;
  target: string;
  revision: number;
  disabled: boolean;
}) {
  const [value, setValue] = useState(data);
  const [state, action, pending] = useActionState(editGenerated, initial);
  return (
    <form action={action} className="card">
      <h2>분석 검수 · 한국어</h2>
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="kind" value="analysis" />
      <input type="hidden" name="language" value="ko" />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="payload" value={JSON.stringify(value)} />
      <p>
        분석 제목: {value.title} · 본문 근거:{" "}
        {value.scripture_references.join(", ") || "확인된 본문 없음"}
      </p>
      <label htmlFor="theme">중심 주제 (원고 근거)</label>
      <textarea
        id="theme"
        value={value.theme.text}
        onChange={(e) =>
          setValue({
            ...value,
            theme: { ...value.theme, text: e.target.value },
          })
        }
        maxLength={3000}
      />
      <details>
        <summary>인명·신학 용어 기준 (목회자 검토 필요)</summary>
        <p>용어를 수정하면 기존 번역은 다시 생성하고 검수해야 합니다.</p>
        {value.terms.map((term, i) => (
          <fieldset key={term.source_term}>
            <legend>{term.source_term}</legend>
            {languages.map((language) => (
              <label key={language}>
                {languageLabels[language]}
                <input
                  value={term.targets[language]}
                  readOnly={language === "ko"}
                  maxLength={200}
                  onChange={(event) =>
                    setValue({
                      ...value,
                      terms: value.terms.map((t, j) =>
                        j === i
                          ? {
                              ...t,
                              targets: {
                                ...t.targets,
                                [language]: event.target.value,
                              },
                            }
                          : t,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
        ))}
      </details>
      <h3>설교자가 제시한 핵심 대지</h3>
      {value.outlines.length ? (
        value.outlines.map((o, i) => <p key={i}>{o.text}</p>)
      ) : (
        <p>원문에서 명확한 대지를 확인하지 못했습니다.</p>
      )}
      <h3>인물과 사건</h3>
      {value.people_events.map((p, i) => (
        <p key={i}>{p.text}</p>
      ))}
      {value.scenes.map((scene, i) => (
        <section key={scene.scene_id} className="card">
          <h3>장면 {scene.scene_id}</h3>
          <details>
            <summary>원문 근거 확인</summary>
            {scene.evidence.map((e, j) => (
              <blockquote key={j}>
                문단 {e.paragraph_id}: {e.quote}
              </blockquote>
            ))}
          </details>
          {(["summary", "background", "visual_description"] as const).map(
            (field) => (
              <div key={field}>
                <label htmlFor={`scene-${i}-${field}`}>
                  {
                    {
                      summary: "교육용 요약 · AI 작성",
                      background:
                        "성경 배경 · AI 보충 설명, 설교자의 발언 아님",
                      visual_description:
                        "시각화할 장면 설명 · 이미지 생성 아님",
                    }[field]
                  }
                </label>
                <textarea
                  id={`scene-${i}-${field}`}
                  value={scene[field]}
                  maxLength={3000}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      scenes: value.scenes.map((s, n) =>
                        n === i ? { ...s, [field]: e.target.value } : s,
                      ),
                    })
                  }
                />
              </div>
            ),
          )}
        </section>
      ))}
      <h3>신학적 검토 필요 항목</h3>
      <ul>
        {value.theological_review.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      <button disabled={disabled || pending}>장면·분석 수정 저장</button>
      <Feedback state={state} />
    </form>
  );
}
export function TranslationEditor({
  data,
  target,
  revision,
  sourceParagraphs,
  disabled,
}: {
  data: Translation;
  target: string;
  revision: number;
  sourceParagraphs: { paragraph_id: number; text: string }[];
  disabled: boolean;
}) {
  const [value, setValue] = useState(data);
  const [state, action, pending] = useActionState(editGenerated, initial);
  return (
    <form action={action} className="card">
      <h2>{languageLabels[data.language]} · 전체 원고 번역</h2>
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="kind" value="translation" />
      <input type="hidden" name="language" value={data.language} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="payload" value={JSON.stringify(value)} />
      <p>
        원문과 대응하는 문단을 비교하세요. 한국어 전체 원고는 원문 그대로
        유지됩니다.
      </p>
      {value.paragraphs.map((p, i) => (
        <div className="scene-edit" key={p.paragraph_id}>
          <div>
            <h3>원문 · 문단 {p.paragraph_id}</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {
                sourceParagraphs.find((s) => s.paragraph_id === p.paragraph_id)
                  ?.text
              }
            </p>
          </div>
          <div>
            <label htmlFor={`${data.language}-paragraph-${p.paragraph_id}`}>
              {languageLabels[data.language]} · 문단 {p.paragraph_id}
            </label>
            <textarea
              id={`${data.language}-paragraph-${p.paragraph_id}`}
              lang={data.language}
              value={p.text}
              readOnly={data.language === "ko"}
              maxLength={20000}
              onChange={(e) =>
                setValue({
                  ...value,
                  paragraphs: value.paragraphs.map((t, n) =>
                    n === i ? { ...t, text: e.target.value } : t,
                  ),
                })
              }
            />
          </div>
        </div>
      ))}
      <h2>장면별 요약 번역 · 전체 원고와 별도</h2>
      {value.scenes.map((s, i) => (
        <section key={s.scene_id}>
          <h3>장면 {s.scene_id}</h3>
          {(["summary", "background"] as const).map((field) => (
            <div key={field}>
              <label htmlFor={`${data.language}-${i}-${field}`}>
                {field === "summary" ? "교육용 요약" : "AI 보충 배경 설명"} ·{" "}
                {languageLabels[data.language]}
              </label>
              <textarea
                id={`${data.language}-${i}-${field}`}
                lang={data.language}
                maxLength={3000}
                value={s[field]}
                onChange={(e) =>
                  setValue({
                    ...value,
                    scenes: value.scenes.map((t, n) =>
                      n === i ? { ...t, [field]: e.target.value } : t,
                    ),
                  })
                }
              />
            </div>
          ))}
        </section>
      ))}
      <button disabled={disabled || pending}>번역 수정 저장</button>
      <Feedback state={state} />
    </form>
  );
}
export function TranslationTabs({
  translations,
  sourceParagraphs,
  target,
  revision,
  staleLanguages,
}: {
  translations: Translation[];
  sourceParagraphs: { paragraph_id: number; text: string }[];
  target: string;
  revision: number;
  staleLanguages: Language[];
}) {
  const [lang, setLang] = useState<Language>("ko");
  const translation = translations.find((t) => t.language === lang);
  return (
    <section>
      <label htmlFor="translation-language">비교할 언어</label>
      <select
        id="translation-language"
        value={lang}
        onChange={(e) => setLang(e.target.value as Language)}
      >
        {languages.map((l) => (
          <option key={l} value={l}>
            {languageLabels[l]}
          </option>
        ))}
      </select>
      {staleLanguages.includes(lang) && (
        <div className="notice">
          이 번역은 이전 원고 또는 분석의 결과입니다. 재생성 전에는 승인할 수
          없습니다.
        </div>
      )}
      {translation ? (
        <TranslationEditor
          key={lang + JSON.stringify(translation)}
          data={translation}
          target={target}
          revision={revision}
          sourceParagraphs={sourceParagraphs}
          disabled={staleLanguages.includes(lang)}
        />
      ) : (
        <p>아직 이 언어로 생성한 번역이 없습니다.</p>
      )}
    </section>
  );
}
export function RequestReview({
  target,
  revision,
}: {
  target: string;
  revision: number;
}) {
  const [state, action, pending] = useActionState(requestReview, initial);
  return (
    <form action={action} className="card">
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="revision" value={revision} />
      <button className="secondary" disabled={pending}>
        목회자에게 검수 요청
      </button>
      <Feedback state={state} />
      <p>
        외부 메시지를 보내지는 않습니다. 요청 상태를 교회 관리 화면에
        기록합니다.
      </p>
    </form>
  );
}
