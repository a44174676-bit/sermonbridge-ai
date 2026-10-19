import { bcv_parser } from "bible-passage-reference-parser";
import * as ko from "bible-passage-reference-parser/esm/lang/ko.js";
import * as en from "bible-passage-reference-parser/esm/lang/en.js";
import * as vi from "bible-passage-reference-parser/esm/lang/vi.js";
import * as ja from "bible-passage-reference-parser/esm/lang/ja.js";
import * as zh from "bible-passage-reference-parser/esm/lang/zh.js";
import {
  analysisSchema,
  translationSchema,
  type Analysis,
  type Language,
  type Source,
  type Translation,
} from "./schema";
export function paragraphs(source: string) {
  const result: {
    paragraph_id: number;
    text: string;
    start: number;
    end: number;
  }[] = [];
  // Every non-empty line is a source unit; UTF-16 offsets are computed by the server, never the model.
  for (const m of source.matchAll(/[^\r\n]+/g)) {
    const text = m[0].trim();
    if (!text) continue;
    const start = m.index + m[0].indexOf(text);
    result.push({
      paragraph_id: result.length + 1,
      text,
      start,
      end: start + text.length,
    });
  }
  if (!result.length || result.length > 200 || source.length > 20000)
    throw new Error("SOURCE_LIMIT");
  return result;
}
export function allowedScripture(source: Source): string[] {
  const parser = new bcv_parser(ko);
  parser.set_options({
    invalid_passage_strategy: "ignore",
    passage_existence_strategy: "bcv",
    testaments: "on",
  });
  // Only explicitly supplied valid references are offered to the model, never model-created locations.
  return [
    ...new Set(
      (
        parser
          .parse(source.scripture + "\n" + source.source)
          .osis_and_indices() as { osis: string }[]
      ).map((r: { osis: string }) => r.osis),
    ),
  ];
}

function checkScriptureInText(
  text: string,
  language: Language,
  allowed: string[],
) {
  const parser = new bcv_parser({ ko, en, vi, ja, "zh-CN": zh }[language]);
  parser.set_options({
    invalid_passage_strategy: "include",
    invalid_sequence_strategy: "include",
    passage_existence_strategy: "bcv",
    testaments: "on",
  });
  const entities = parser.parse(text).parsed_entities() as {
    osis: string;
    entities: unknown[];
  }[];
  function hasInvalid(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(hasInvalid);
    const o = value as Record<string, unknown>;
    return Object.entries(o).some(
      ([key, v]) =>
        key.endsWith("_not_exist") ||
        (key === "valid" && v === false) ||
        hasInvalid(v),
    );
  }
  if (
    entities.some((e) => hasInvalid(e) || (e.osis && !allowed.includes(e.osis)))
  )
    throw new Error("INVALID_SCRIPTURE");
}

export const glossary: Record<string, Record<Language, string>> = {
  하나님: {
    ko: "하나님",
    en: "God",
    vi: "Đức Chúa Trời",
    ja: "神",
    "zh-CN": "上帝",
  },
  예수: {
    ko: "예수",
    en: "Jesus",
    vi: "Chúa Giê-su",
    ja: "イエス",
    "zh-CN": "耶稣",
  },
  은혜: { ko: "은혜", en: "grace", vi: "ân điển", ja: "恵み", "zh-CN": "恩典" },
  드보라: {
    ko: "드보라",
    en: "Deborah",
    vi: "Đê-bô-ra",
    ja: "デボラ",
    "zh-CN": "底波拉",
  },
  바락: {
    ko: "바락",
    en: "Barak",
    vi: "Ba-rác",
    ja: "バラク",
    "zh-CN": "巴拉",
  },
  시스라: {
    ko: "시스라",
    en: "Sisera",
    vi: "Si-sê-ra",
    ja: "シセラ",
    "zh-CN": "西西拉",
  },
  야엘: { ko: "야엘", en: "Jael", vi: "Gia-ên", ja: "ヤエル", "zh-CN": "雅亿" },
};
export function validateAnalysis(
  value: unknown,
  source: Source,
  generated = true,
): Analysis {
  const data = analysisSchema.parse(value);
  const ps = paragraphs(source.source);
  const refs = allowedScripture(source);
  const evidence = [
    ...data.theme.evidence,
    ...data.outlines.flatMap((o) => o.evidence),
    ...data.people_events.flatMap((o) => o.evidence),
    ...data.scenes.flatMap((s) => s.evidence),
  ];
  for (const e of evidence)
    if (
      !ps.find((p) => p.paragraph_id === e.paragraph_id)?.text.includes(e.quote)
    )
      throw new Error("INVALID_EVIDENCE");
  if (data.scripture_references.some((r) => !refs.includes(r)))
    throw new Error("INVALID_SCRIPTURE");
  for (const text of [
    data.title,
    data.theme.text,
    ...data.outlines.map((o) => o.text),
    ...data.people_events.map((o) => o.text),
    ...data.scenes.flatMap((s) => [
      s.summary,
      s.background,
      s.visual_description,
    ]),
    ...data.theological_review,
  ])
    checkScriptureInText(text, "ko", refs);
  if (data.scenes.some((s, i) => s.scene_id !== i + 1))
    throw new Error("INVALID_SCENES");
  const seen = new Set<string>();
  for (const term of data.terms) {
    if (
      !source.source.includes(term.source_term) ||
      seen.has(term.source_term) ||
      term.targets.ko !== term.source_term
    )
      throw new Error("INVALID_TERMS");
    seen.add(term.source_term);
    const fixed = glossary[term.source_term];
    if (
      generated &&
      fixed &&
      Object.keys(fixed).some(
        (l) => fixed[l as Language] !== term.targets[l as Language],
      )
    )
      throw new Error("INCONSISTENT_TERMS");
  }
  return data;
}
function checkTerms(
  original: string,
  translated: string,
  language: Language,
  terms: Analysis["terms"],
) {
  const vocabulary = {
    ...glossary,
    ...Object.fromEntries(terms.map((t) => [t.source_term, t.targets])),
  };
  for (const [term, values] of Object.entries(vocabulary))
    if (
      original.includes(term) &&
      !translated
        .toLocaleLowerCase()
        .includes(values[language].toLocaleLowerCase())
    )
      throw new Error("INCONSISTENT_TERMS");
}
export function validateTranslation(
  value: unknown,
  source: Source,
  analysis: Analysis,
  language: Language,
): Translation {
  const data = translationSchema.parse(value),
    ps = paragraphs(source.source);
  if (
    data.language !== language ||
    data.paragraphs.length !== ps.length ||
    data.scenes.length !== analysis.scenes.length
  )
    throw new Error("INVALID_TRANSLATION_COVERAGE");
  data.paragraphs.forEach((p, i) => {
    if (p.paragraph_id !== ps[i].paragraph_id)
      throw new Error("INVALID_PARAGRAPH");
    if (language === "ko" && p.text !== ps[i].text)
      throw new Error("KOREAN_ORIGINAL_CHANGED");
    checkTerms(ps[i].text, p.text, language, analysis.terms);
  });
  data.scenes.forEach((s, i) => {
    if (s.scene_id !== analysis.scenes[i].scene_id)
      throw new Error("INVALID_SCENES");
    checkTerms(analysis.scenes[i].summary, s.summary, language, analysis.terms);
    checkTerms(
      analysis.scenes[i].background,
      s.background,
      language,
      analysis.terms,
    );
  });
  for (const text of [
    ...data.paragraphs.map((p) => p.text),
    ...data.scenes.flatMap((s) => [s.summary, s.background]),
  ])
    checkScriptureInText(text, language, allowedScripture(source));
  return data;
}
