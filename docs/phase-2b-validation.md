# Phase 2B 검증 보고

검증일: 2026-10-19 (한국 시간). 합성 테스트 자료만 사용했습니다. 실제 목사님 원고가 아닙니다.

## 완료 기능

- 공식 OpenAI SDK 7.39.0의 Responses API와 strict JSON Schema, Zod 검증을 연결했습니다.
- 원고 ID·버전과 연결한 제목·본문·중심 주제·실제 대지·인물/사건·3~5개 장면·신학 검토 항목을 저장합니다.
- ko/en/vi/ja/zh-CN 전체 원고와 장면별 요약·배경 번역을 분리 저장합니다.
- 문단 ID·문자 위치·원문 인용을 검사하고, 입력에 없는 성경 구절과 존재하지 않는 장·절을 거부합니다. 용어 일관성과 원문 문단 누락도 검사합니다.
- 원문/번역 비교 편집, 장면 수정, 용어 기준 수정, 재생성, 검수 요청, 목회자 승인 및 수정 후 승인 해제를 구현했습니다.
- 사용자 제한·중복 방지·비용 사전 예약·사용량 기록·실패/만료 복구를 DB 트랜잭션으로 처리합니다.
- Phase 1의 8개 화면·3언어 데모와 Phase 2A 인증·교회별 접근 통제를 유지했습니다.

## 변경 파일

| 영역 | 주요 파일 |
| --- | --- |
| AI 구조·검증·실행 | `src/lib/ai/schema.ts`, `grounding.ts`, `provider.ts`, `engine.ts`, `server.ts` |
| 서버 작업 | `src/app/operations/ai-actions.ts` |
| 생성·비교·검수 UI | `src/components/ai/controls.tsx`, `workspace.tsx`, `src/components/operations/app.tsx`, `forms.tsx` |
| 서버 실행·메타데이터·타입 | `src/app/[[...path]]/page.tsx`, `src/app/layout.tsx` |
| DB | `supabase/migrations/202610190002_phase2b.sql` |
| 테스트 | `tests/ai.test.ts`, `tests/fixtures/ai.ts`, `tests/database/ai.integration.ts`, `tests/database/migration.test.mjs`, `tests/operations/ai.spec.ts` |
| 실행 도구 | `scripts/apply-phase2b.mjs`, `scripts/verify-openai.mts`, `playwright.config.ts` |
| 의존성·설정·문서 | `package.json`, `package-lock.json`, `.env.example`, `README.md`, Phase 2A 설정 안내, 본 문서 및 Phase 2B 설정 안내 |

## 데이터베이스

기존 테이블을 삭제하지 않고 원고 버전·검수 요청 필드를 추가했습니다. `sermon_analyses`, `sermon_translations`, `generation_jobs`, `ai_policy`를 추가하고 기존 번역 테이블의 언어 제한을 확장했습니다. 신규 테이블까지 총 11개 테이블에 RLS가 있습니다. 기존 sections/translations 데이터는 유지하며 새로운 구조화된 결과는 전용 테이블에 저장합니다.

사용자 JWT는 해당 교회 결과·작업만 읽습니다. 일반 사용자는 작업 완료·비용·결과를 테이블에 직접 기록할 수 없습니다. 서버 전용 RPC가 인증된 사용자의 교회 소속·버전·비용을 다시 검사합니다. 최종 승인은 admin/pastor만 허용합니다. 익명 원고 읽기는 승인 여부와 무관하게 계속 차단합니다.

## 직접 실행한 테스트

| 명령 / 검증 | 결과 |
| --- | --- |
| `npm test` | 27개 통과: 기존 단위 테스트 포함, 구조·근거·5언어·용어·SDK 모의 응답·오류 검증 |
| `npm run test:rls` | 23개 통과: 실제 PostgreSQL RLS/역할/교회/익명 접근 |
| `npm run test:ai:db` | 16개 통과: 실제 DB 저장·재조회·동시 비용 예약·실패/재시도·버전·중복·권한·신규 격리 DB 마이그레이션 |
| `npm run test:operations` | 20개 통과: 데스크톱·모바일 실제 로컬 Auth/DB, 로그인·저장·5언어 편집·검수·승인 |
| `npm run test:e2e` | 12개 통과: 기존 데모 8화면·반응형·언어·파일·검수 흐름 |
| `npm run lint`, `npm run typecheck` | 통과 |
| `npm run build` | 프로덕션 빌드 통과 |
| 서버 키 노출 표식 검사 | 가짜 키 표식으로 빌드 후 클라이언트 JS 13개 검사: 노출 없음 |
| `git check-ignore .env.local` | Git 제외 확인 |
| `npm run test:ai:live` | **미실행**: 실제 키/모델 미설정 안내와 종료 코드 2 |

자동 테스트 **총 98개 통과**. DB/Auth/PostgREST는 실제 로컬 서비스이며 **OpenAI 응답만 모의**입니다. 번역 품질이나 실제 유료 호출 성공을 뜻하지 않습니다. 실제 OpenAI 호출은 **0회**입니다.

기존 개발 서버의 Next 개발 잠금 때문에 데모 테스트 서버가 최초 시작에 실패했습니다. 기존 프로세스를 종료하지 않고, 데모 테스트를 빌드 후 별도 3004 포트의 프로덕션 서버에서 실행하도록 수정해 12개 모두 통과했습니다.

## 공식 SDK·모델 확인 범위

[OpenAI 공식 Node SDK](https://github.com/openai/openai-node) README와 설치된 SDK의 `helpers/zod.d.ts`·모델 타입을 확인했습니다. [공식 GPT-4.1 Cookbook](https://github.com/openai/openai-cookbook/blob/main/examples/gpt4-1_prompting_guide.ipynb)도 확인했습니다. 공식 platform 문서 직접 조회는 이 환경에서 403으로 차단되었습니다.

`responses.create`에 `zodTextFormat`을 전달하고, 응답 JSON을 다시 Zod/원문 근거로 검증합니다. 이를 통해 잘못된 결과도 실제 토큰 사용량을 버리지 않고 기록합니다. 모델명은 환경변수이며 후보 `gpt-4.1-mini`의 현재 계정 접근 권한과 실제 API 구조화 출력은 아직 검증하지 못했습니다. 실제 호출 검증 도구를 별도로 준비했습니다.

## 비용·보안 한계와 다음 단계

비용 제한은 DB에서 병렬 요청까지 검사하고 API 실패 시 불명확한 비용을 예약액으로 보수적으로 유지합니다. 단가 기본값은 검증되지 않은 예시이며 생성은 기본 비활성입니다. 실제 요금 검증과 OpenAI 계정 지출 한도 설정이 필요합니다.

근거 문자열이 실제 원문에 존재하는 것과 해석·번역이 옳은 것은 다릅니다. 목회자 및 각 언어 검수자가 최종 확인해야 합니다. 스냅샷 보존·삭제 정책, 실제 운영 배포, 서비스 키 보관과 회전도 운영 준비 항목입니다. 상시 백그라운드 워커는 없으므로 실행 환경의 시간제한과 중단 복구를 실제 배포에서 확인해야 합니다.

**Phase 3 구현 기반은 준비되었습니다.** 실제 API 분석·5언어 번역·요금·목회자 검수를 먼저 통과한 다음 이미지 단계로 진행하는 것이 적절합니다. 이번에는 이미지 생성·음성·QR·자동 슬라이드 전환을 추가하지 않았습니다.

실행 화면과 사용자가 설정할 사항은 [Phase 2B 설정 안내](phase-2b-setup.md)를 따르세요. GitHub push와 Vercel 배포는 수행하지 않았습니다. 클라우드 시작 안내는 설정 초안에 저장했으며 활성화하려면 환경 설정에서 검토·저장 후 게시해야 합니다.
