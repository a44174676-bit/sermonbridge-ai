import { z } from "zod";
export type Language = "ko" | "en" | "vi";
export type Scene = {
  title: string;
  text: Record<Language, string>;
  term: Record<Language, string>;
};
export type Sermon = {
  title: string;
  source: string;
  approved: boolean;
  scenes: Scene[];
};
export const demo: Sermon = {
  title: "하나님의 승리에 참여하려면?",
  source:
    "테스트용 요약 자료 — 목사님의 실제 설교 원고가 아닙니다.\n2026년 10월 18일 · 사사기 4:14–21\n1. 앞서 행하시는 하나님을 믿고 따라가라.\n2. 어떤 상황에서도 하나님의 편에 서라.\n등장인물: 드보라, 바락, 시스라, 야엘.",
  approved: false,
  scenes: [
    {
      title: "드보라와 바락",
      text: {
        ko: "드보라는 바락에게 나아가라고 말합니다. 앞서 행하시는 하나님을 믿고 따라가는 믿음을 생각해 봅니다.",
        en: "Deborah tells Barak to advance. We reflect on trusting and following God, who goes before us.",
        vi: "Đê-bô-ra bảo Ba-rác tiến lên. Chúng ta suy ngẫm về việc tin cậy và đi theo Đức Chúa Trời, Đấng đi trước chúng ta.",
      },
      term: {
        ko: "드보라: 사사기에 등장하는 예언자이자 사사입니다.",
        en: "Deborah: a prophet and judge in the Book of Judges.",
        vi: "Đê-bô-ra: nữ tiên tri và quan xét trong sách Các Quan Xét.",
      },
    },
    {
      title: "전투와 도주",
      text: {
        ko: "바락이 나아가고 시스라는 도망합니다. 이 요약은 전투의 폭력적인 세부 묘사를 생략합니다.",
        en: "Barak advances and Sisera flees. This summary omits graphic details of the battle.",
        vi: "Ba-rác tiến lên và Si-sê-ra bỏ chạy. Bản tóm tắt này lược bỏ các chi tiết bạo lực của trận chiến.",
      },
      term: {
        ko: "시스라: 가나안 왕 야빈의 군대 장관입니다.",
        en: "Sisera: commander of the army of Jabin, a Canaanite king.",
        vi: "Si-sê-ra: chỉ huy quân đội của Gia-bin, một vua Ca-na-an.",
      },
    },
    {
      title: "야엘의 장막",
      text: {
        ko: "시스라는 야엘의 장막에 이릅니다. 어려운 본문의 역사적 맥락과 오늘의 적용은 목회자와 함께 검토해 주세요.",
        en: "Sisera arrives at Jael’s tent. Please review the historical context and application of this difficult passage with a pastor.",
        vi: "Si-sê-ra đến lều của Gia-ên. Xin cùng mục sư xem xét bối cảnh lịch sử và cách áp dụng phân đoạn khó này.",
      },
      term: {
        ko: "장막: 이동하며 생활할 때 사용하는 천막입니다.",
        en: "Tent: a portable shelter used as a dwelling.",
        vi: "Lều: nơi ở có thể di chuyển được.",
      },
    },
  ],
};
export const MAX_SOURCE = 20000;
export function validateSource(title: string, source: string): string | null {
  if (!title.trim() || title.length > 120)
    return "제목을 1~120자로 입력해 주세요.";
  if (!source.trim() || source.length > MAX_SOURCE)
    return "원고를 1~20,000자로 입력해 주세요.";
  return null;
}
export function validTextFile(name: string, size: number) {
  return /\.txt$/i.test(name) && size <= 80000;
}

const textSchema = z.object({
  ko: z.string().max(3000),
  en: z.string().max(3000),
  vi: z.string().max(3000),
});
const sermonSchema = z.object({
  title: z.string().min(1).max(120),
  source: z.string().max(MAX_SOURCE),
  approved: z.boolean(),
  scenes: z
    .array(z.object({ title: z.string(), text: textSchema, term: textSchema }))
    .max(5),
});
export const sessionSchema = z.object({
  demo: sermonSchema.extend({
    scenes: z
      .array(
        z.object({ title: z.string(), text: textSchema, term: textSchema }),
      )
      .length(3),
  }),
  local: sermonSchema.nullable(),
});
