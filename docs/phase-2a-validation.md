# Phase 2A 검증 결과

## 실행 환경과 결과

Node.js 24, Next.js 16.4.2, Chromium에서 실행했습니다. 인증/저장 테스트는 Docker의 PostgreSQL 17 + 실제 Supabase Auth v2.186.0 + PostgREST v13.0.7에 대해 수행했습니다. 실제 목사님 원고·실제 교회 계정·호스팅 프로젝트는 사용하지 않았습니다.

| 검사                  | 결과                                      |
| --------------------- | ----------------------------------------- |
| ESLint                | 오류·경고 없음                            |
| TypeScript strict     | 오류 없음                                 |
| Vitest                | 기존 입력 검증 3 + 모드 분리 3 = 6개 통과 |
| 실제 PostgreSQL RLS   | 23개 통과, 실패·건너뜀 없음               |
| 운영 모드 Playwright  | 데스크톱 6 + 모바일 6 = 12개 통과         |
| Phase 1 Playwright    | 기존 12개 모두 통과                       |
| Next.js 프로덕션 빌드 | 통과                                      |
| `.env.local` Git 제외 | 확인                                      |

## 사용자 요구사항과 검증 대응

1. 비로그인 관리 화면: dashboard·원고 등록·원고 상세·구성원·프레젠테이션 경로 모두 로그인으로 이동.
2. 교회 격리: A가 B의 원고를 SQL과 PostgREST에서 조회하면 0행, 수정도 0행. 다른 교회에 삽입 시 RLS 거부. 절·번역·검수 이력·교회 정보도 교차 조회 차단.
3. 승인 제한: media는 승인 RPC/직접 status 쓰기 모두 DB 오류 42501. pastor는 승인 가능. 다른 교회 admin은 승인 불가.
4. 공개 URL: 운영 원고 `/s/[id]`는 404. SQL에서도 익명 권한 없음. 승인 완료 후에도 익명 조회 불가.
5. 인증: 실제 Auth 로그인·HttpOnly 쿠키·새로고침 세션 유지·로그아웃·로그아웃 후 원고 재접근 차단을 확인.
6. 영구 저장: 원고 작성 후 로그아웃, 브라우저 localStorage/sessionStorage 초기화, 재로그인해도 같은 DB 원고가 유지됨.
7. 데모 분리: 운영 로그인 상태에서 `/demo`는 샘플만 표시. 데모 등록 내용이 운영 대시보드에 나타나지 않음. 강제 Demo Mode/누락된 설정에서는 운영 클라이언트를 생성하지 않음.

추가로 검수 이력 조작, 소속 교회 재할당, 스스로 관리자 승격, 다른 교회 역할 변경, 마지막 관리자 해제, 오래된 revision 승인, 교회가 다른 절의 연결을 차단했습니다. 원문·절·번역 수정에 따른 승인 초기화와 구성원 비활성화 즉시 접근 차단도 확인했습니다.

## 발견한 문제와 처리

- 로컬 GoTrue 초기 search_path가 public이어서 Auth 테이블을 찾지 못함. 테스트 DB 초기화 시 auth/public search_path를 설정하도록 수정하고 합성 DB를 새로 구성했습니다. 최종 23개 DB 테스트는 완성된 사용자/교회 fixture가 있는 실제 DB에서 실행됐습니다. fixture가 없으면 테스트 자체를 시작하지 않도록 사전 검증도 추가했습니다.
- 로딩 Suspense가 권한 결정 전에 응답을 시작하여 차단 화면이 HTTP 200이 됨. 로딩 경계를 제거하고 요청마다 서버에서 인증/RLS 조회 후 404/리다이렉트를 확정하도록 수정했습니다. Cache Components를 비활성화해 운영 세션 자료를 정적 캐시에 저장하지 않습니다.
- 검수 화면의 두 status 요소로 테스트 선택이 모호함. 검수 결과 메시지를 구체적으로 지정하도록 수정했습니다.
- 기존 3000 포트 서버와 테스트가 충돌함. 기존 서버를 임의로 종료하거나 재사용하지 않고 데모 회귀 테스트 포트를 3002로 분리했습니다. 운영 테스트는 3001을 사용합니다.

## 주요 변경 파일

- `src/lib/supabase/config.ts`, `server.ts`, `src/proxy.ts`: 모드 분리·서버 세션·쿠키 갱신.
- `src/app/operations/actions.ts`: 로그인·로그아웃·원고 저장·검수·권한 변경 서버 액션.
- `src/components/operations/app.tsx`, `forms.tsx`: 운영 관리 UI.
- `src/app/[[...path]]/page.tsx`, `src/components/demo-app.tsx`, `next.config.ts`: 운영/데모 라우팅과 요청 시 렌더링.
- `src/app/error.tsx`: 비밀정보를 노출하지 않는 오류 화면.
- `supabase/migrations/202610190001_phase2a.sql`, `supabase/bootstrap-admin.sql`: DB·RLS·검수/권한 RPC·최초 관리자 지정.
- `tests/database/rls.test.mjs`, `tests/operations/auth.spec.ts`, `tests/mode.test.ts`: 권한·인증·영속성·모드 테스트.
- `scripts/local-services.mjs`, `test-gateway.mjs`, `seed-test-users.mjs`: 격리된 실제 서비스 테스트 재현.
- `playwright.config.ts`, `playwright.operations.config.ts`, `package.json`, `package-lock.json`: 의존성·실행 명령·테스트 구성.
- `.env.example`, `README.md`, `docs/phase-2a-setup.md`: 운영 전환 및 설정 안내.

## 판정

Phase 2B 개발을 시작할 기반은 검증됐습니다. **실제 서비스 운영 승인을 의미하지는 않습니다.** 호스팅 Supabase에 SQL 적용·관리자 등록·환경변수·HTTPS/메일/로그인 제한을 설정하고 해당 환경에서 다시 검증해야 합니다. MFA·복구 UI·전체 권한 변경 감사 로그·원고 보존 정책 등은 설정 문서의 남은 범위를 참고하세요.
