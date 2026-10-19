import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { supabaseConfig } from "../src/lib/supabase/config";
afterEach(() => vi.unstubAllEnvs());
describe("운영과 데모 모드 분리", () => {
  it("설정이 없으면 운영 클라이언트를 만들지 않는다", () => {
    vi.stubEnv("APP_MODE", "auto");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(supabaseConfig()).toBeNull();
  });
  it("설정이 일부만 있어도 안전하게 데모로 동작한다", () => {
    vi.stubEnv("APP_MODE", "auto");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(supabaseConfig()).toBeNull();
  });
  it("데모 모드는 키가 있어도 운영 연결을 사용하지 않는다", () => {
    vi.stubEnv("APP_MODE", "demo");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    expect(supabaseConfig()).toBeNull();
  });
});
