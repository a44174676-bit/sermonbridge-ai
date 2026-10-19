import { describe, expect, it } from "vitest";
import {
  demo,
  sessionSchema,
  validTextFile,
  validateSource,
} from "../src/lib/demo";
describe("데모 입력 검증", () => {
  it("빈 원고와 초과 입력을 거부한다", () => {
    expect(validateSource("", "내용")).not.toBeNull();
    expect(validateSource("제목", " ")).not.toBeNull();
    expect(validateSource("제목", "가".repeat(20001))).not.toBeNull();
    expect(validateSource("제목", "요약")).toBeNull();
  });
  it("TXT 파일 크기와 확장자를 제한한다", () => {
    expect(validTextFile("원고.txt", 80000)).toBe(true);
    expect(validTextFile("원고.pdf", 10)).toBe(false);
    expect(validTextFile("원고.txt", 80001)).toBe(false);
  });
  it("샘플과 언어 구조를 검증하고 손상된 저장 자료를 거부한다", () => {
    expect(sessionSchema.safeParse({ demo, local: null }).success).toBe(true);
    expect(
      sessionSchema.safeParse({ demo: { ...demo, scenes: [] }, local: null })
        .success,
    ).toBe(false);
    expect(demo.source).toContain("실제 설교 원고가 아닙니다");
  });
});
