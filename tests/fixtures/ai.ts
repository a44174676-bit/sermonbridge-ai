import { glossary, paragraphs } from "../../src/lib/ai/grounding";
import type {
  Analysis,
  Language,
  Source,
  Translation,
} from "../../src/lib/ai/schema";
export const syntheticSource: Source = {
  id: "30000000-0000-4000-8000-000000000001",
  title: "합성 테스트용 요약 — 실제 목사님 원고 아님",
  scripture: "사사기 4:14–21",
  source:
    "드보라와 바락은 하나님을 신뢰합니다.\n시스라는 도망합니다.\n야엘의 장막을 생각합니다.",
  source_version: 1,
  analysis_version: 0,
};
export function mockAnalysis(source: Source = syntheticSource): Analysis {
  const ps = paragraphs(source.source);
  const evidence = (i: number) => [
    { paragraph_id: ps[i].paragraph_id, quote: ps[i].text },
  ];
  return {
    title: source.title,
    terms: Object.entries(glossary)
      .filter(([term]) => source.source.includes(term))
      .map(([source_term, targets]) => ({
        source_term,
        targets: { ...targets },
      })),
    scripture_references: ["Judg.4.14-Judg.4.21"],
    theme: { text: "하나님을 신뢰합니다.", evidence: evidence(0) },
    outlines: [{ text: "하나님을 신뢰합니다.", evidence: evidence(0) }],
    people_events: [{ text: "드보라와 바락", evidence: evidence(0) }],
    scenes: ps.slice(0, 3).map((p, i) => ({
      scene_id: i + 1,
      evidence: evidence(i),
      summary: p.text,
      background: "목회자와 본문을 함께 검토합니다.",
      visual_description: "폭력적 세부 묘사 없는 교육용 장면 설명",
    })),
    theological_review: ["합성 테스트 응답입니다. 실제 AI 호출이 아닙니다."],
  };
}
export function mockTranslation(
  language: Language,
  source: Source = syntheticSource,
  analysis: Analysis = mockAnalysis(source),
): Translation {
  const translate = (text: string) => {
    if (language === "ko") return text;
    let result = text;
    for (const [term, v] of Object.entries(glossary))
      result = result.replaceAll(term, v[language]);
    return `[${language} 모의 번역] ${result}`;
  };
  return {
    language,
    paragraphs: paragraphs(source.source).map((p) => ({
      paragraph_id: p.paragraph_id,
      text: translate(p.text),
    })),
    scenes: analysis.scenes.map((s) => ({
      scene_id: s.scene_id,
      summary: translate(s.summary),
      background: translate(s.background),
    })),
  };
}
