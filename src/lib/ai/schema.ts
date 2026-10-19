import { z } from "zod";
export const languages = ["ko", "en", "vi", "ja", "zh-CN"] as const;
export type Language = (typeof languages)[number];
export const languageLabels: Record<Language, string> = {
  ko: "한국어",
  en: "English",
  vi: "Tiếng Việt",
  ja: "日本語",
  "zh-CN": "简体中文",
};
const text = z.string().min(1).max(3000);
export const evidenceSchema = z
  .object({
    paragraph_id: z.number().int().positive(),
    quote: z.string().min(1).max(2000),
  })
  .strict();
const grounded = z
  .object({ text, evidence: z.array(evidenceSchema).min(1).max(10) })
  .strict();
export const analysisSchema = z
  .object({
    title: z.string().min(1).max(120),
    scripture_references: z.array(z.string()).max(20),
    theme: grounded,
    outlines: z.array(grounded).max(10),
    people_events: z.array(grounded).max(20),
    terms: z
      .array(
        z
          .object({
            source_term: z.string().min(1).max(80),
            targets: z
              .object({
                ko: z.string().min(1).max(120),
                en: z.string().min(1).max(120),
                vi: z.string().min(1).max(120),
                ja: z.string().min(1).max(120),
                "zh-CN": z.string().min(1).max(120),
              })
              .strict(),
          })
          .strict(),
      )
      .max(40),
    scenes: z
      .array(
        z
          .object({
            scene_id: z.number().int().min(1).max(5),
            evidence: z.array(evidenceSchema).min(1).max(10),
            summary: text,
            background: text,
            visual_description: text,
          })
          .strict(),
      )
      .min(3)
      .max(5),
    theological_review: z.array(text).max(20),
  })
  .strict();
export type Analysis = z.infer<typeof analysisSchema>;
export const translationSchema = z
  .object({
    language: z.enum(languages),
    paragraphs: z
      .array(
        z
          .object({
            paragraph_id: z.number().int().positive(),
            text: z.string().min(1).max(20000),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    scenes: z
      .array(
        z
          .object({
            scene_id: z.number().int().min(1).max(5),
            summary: text,
            background: text,
          })
          .strict(),
      )
      .min(3)
      .max(5),
  })
  .strict();
export type Translation = z.infer<typeof translationSchema>;
export type Source = {
  id: string;
  title: string;
  source: string;
  scripture: string;
  source_version: number;
  analysis_version: number;
};
export type Usage = { input_tokens: number; output_tokens: number };
export type Kind = "analysis" | "translation";
