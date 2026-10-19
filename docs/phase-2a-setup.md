# Phase 2A — 실제 인증·원고 보호·저장

## 구현 범위

- Supabase Auth 이메일/비밀번호 로그인, 서버 쿠키 세션 갱신, 현재 기기 로그아웃.
- 서버에서 `getUser()`로 사용자 확인. 로그인되지 않은 관리 페이지는 로그인 화면으로 이동.
- 교회별 PostgreSQL 원고 저장·수정, 목회자/관리자 최종 승인·승인 해제·검수 이력.
- `admin`은 교회 구성원 역할/활성을 관리, `pastor`는 검수 승인, `media`는 원고 작성/수정만 가능. 활성 구성원은 같은 교회 자료를 공유합니다. 작성자 개인에게만 한정된 원고 보관함은 아닙니다.
- 수정 시 승인 해제 및 revision 증가. 이전 버전을 보고 저장/승인하면 거부해 동시 편집 손실을 줄입니다.
- 최초 관리자는 SQL Editor에서 수동 등록. 회원가입 metadata의 role은 사용하지 않습니다.
- 운영 경로는 `/dashboard`, `/sermons/new`, `/sermons/[uuid]`, `/sermons/[uuid]/review`, `/members`. `/present/[uuid]`는 로그인 후 준비 상태만 표시.
- `/demo` 아래에서 Phase 1의 모든 화면을 체험할 수 있습니다. `/s/demo`는 항상 고정 샘플 뷰어입니다. 데모 링크는 데모 경로 안에서 이동하며 운영 DB를 조회하지 않습니다.
- **Phase 2A에서는 승인된 원고도 익명 공개하지 않습니다.** 모든 운영 `/s/[slug]`는 404입니다. 공개 자료 모델은 Phase 4에서 별도로 설계합니다.
- AI·이미지·비용 발생 API 호출은 없습니다. 운영 원고에 가짜 샘플 번역을 붙이지 않습니다.

## 사용자가 Supabase에서 설정할 순서

1. 별도 Supabase 프로젝트를 생성합니다. 운영과 테스트 프로젝트를 분리하세요.
2. SQL Editor에서 `supabase/migrations/202610190001_phase2a.sql`을 **한 번** 실행합니다. 새 DB용 마이그레이션이며 재실행 스크립트가 아닙니다. 운영 DB는 먼저 백업하세요. SQL 파일 자체를 임의로 중간까지만 적용하지 마세요.
3. Authentication 설정에서 일반 이메일 회원가입을 끕니다(Allow new users to sign up 해제). 이메일/비밀번호 로그인을 활성화하고 강한 비밀번호 정책과 로그인 속도 제한을 설정합니다. Site URL은 실제 HTTPS 웹 주소로 제한하고 허용 리다이렉트 URL에 광범위한 와일드카드를 넣지 않습니다. 초대·비밀번호 복구 메일을 사용하려면 SMTP를 설정합니다. 현재 앱에는 셀프 가입/비밀번호 복구 화면이 없으므로 관리자가 Auth 대시보드의 계정 생성·복구 절차를 사용합니다.
4. Authentication > Users에서 최초 관리자 계정을 직접 생성하고 인증된 이메일 상태를 확인합니다. 관리자 임시 비밀번호는 채팅/소스코드에 기록하지 말고 안전한 별도 경로로 전달하세요.
5. `supabase/bootstrap-admin.sql`의 UUID를 해당 사용자의 UUID로, 교회 이름을 실제 이름으로 바꿔 SQL Editor에서 실행합니다. 이 스크립트를 다시 실행하면 교회가 추가로 만들어지므로 최초 교회 생성에만 사용합니다. `service_role`을 브라우저에 전달하지 않습니다.
6. `.env.example`을 참고해 `.env.local`에 `APP_MODE=auto`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정합니다. anon 또는 publishable 공개 키를 사용합니다. **Phase 2A 인증만 사용할 때는 service_role/secret 키가 필요 없습니다. Phase 2B 작업 서버에는 서버 전용 키가 필요하므로 [추가 설정](phase-2b-setup.md)을 따르세요.** NEXT_PUBLIC 값은 변경 후 빌드·재시작이 필요합니다. Vercel에서는 동일한 값을 환경 설정에 입력하고 재배포합니다.
7. `npm ci`, `npm run build`, `npm start`로 실행합니다. 첫 관리자 로그인 후 `/members`에서 목회자·자료 담당자 권한을 지정합니다. 다른 계정도 먼저 Auth Users에서 생성해야 합니다. 교회 미소속 사용자는 로그인은 가능하지만 원고는 읽거나 저장할 수 없습니다. 본인 UUID만 확인하여 관리자에게 전달할 수 있습니다.
8. 실제 프로젝트에서 두 개의 테스트 교회/계정으로 격리 정책을 확인하고, 기존 권한 정책·DB 관리자 권한·백업/보존 정책을 점검한 후 실제 원고를 입력하세요. 이 작업에서는 호스팅된 사용자 Supabase 프로젝트에 접속하거나 마이그레이션을 적용하지 않았습니다.

네트워크 제한이 있는 클라우드에서는 해당 프로젝트의 정확한 Supabase 호스트를 허용 목록에 추가해야 합니다. 값은 환경 설정 또는 `.env.local`에만 보관하세요. 저장소의 `.gitignore`는 `.env.local`을 제외합니다.

## 테이블·권한 설계

| 테이블             | 내용                                  | 읽기/쓰기 범위                                            |
| ------------------ | ------------------------------------- | --------------------------------------------------------- |
| churches           | 교회 이름, 생성자                     | 활성 교회 구성원 읽기 / 관리자 이름 수정                  |
| profiles           | Auth 사용자 프로필                    | 본인 조회·표시 이름 수정; 역할 컬럼 없음                  |
| church_memberships | 교회별 역할·active                    | 본인 또는 교회 관리자 조회; 관리자 RPC만 변경             |
| sermons            | 원문, 제목, 본문, revision, 승인 상태 | 활성 교회 구성원 읽기·작성·수정; 승인 필드 직접 쓰기 불가 |
| sermon_sections    | 원문/보충/요약 구분                   | 같은 교회 구성원; 부모 설교와 교회 복합 FK                |
| translations       | ko/en/vi 텍스트                       | 같은 교회 구성원; 절/설교/교회 복합 FK                    |
| reviews            | 검수자, 결정, 버전, 메모              | 같은 교회 읽기; 승인 RPC만 추가, 클라이언트 수정 불가     |

모든 테이블에 RLS 적용, `anon` 접근 권한 제거. 승인 상태와 무관하게 원문 익명 읽기 정책이 없습니다. 구성원 판별 함수는 순환 RLS를 피하도록 `private` 스키마의 제한된 `SECURITY DEFINER` 함수로 구현합니다. 모든 권한 함수에 고정된 빈 search_path와 완전한 테이블 이름을 사용합니다. 함수 실행 권한도 명시적으로 제한합니다. Supabase 관리자의 SQL/서비스 역할은 RLS를 우회할 수 있으므로 앱에서는 사용하지 않습니다.

`review_sermon`은 원고 잠금·교회 역할·revision을 검사하고 승인과 검수 이력을 하나의 트랜잭션으로 기록합니다. 원문·절·번역이 바뀌면 재검수해야 합니다. `manage_membership`은 교회 잠금으로 동시 권한 변경을 직렬화하고 마지막 활성 관리자 삭제/강등을 거부합니다. DB 컬럼 권한으로 church_id/created_by/status 등의 직접 조작을 막습니다.

## 로컬 실제 서비스 검증 재현

Docker가 필요합니다. 테스트는 PostgreSQL 17, 실제 Supabase Auth(GoTrue), PostgREST를 사용합니다. RLS를 프런트엔드나 가짜 함수로 모의하지 않습니다. 로컬 `auth.uid()`는 Supabase의 JWT subject를 읽는 동작을 구현합니다. 이 작은 테스트 스택은 호스팅 Supabase의 SMTP·게이트웨이·운영 설정 전체를 복제하지는 않습니다.

**아래 스크립트는 기존 `.env.local`을 덮어쓰지 않으며 운영 프로젝트에 실행하면 안 됩니다.** 테스트 전용 `.env.local`에 생성한 무작위 자격증명만 저장하고 실제 원고를 쓰지 않습니다.

```bash
npm ci
npm run test:services
# 다른 터미널에서 실행하고 유지
npm run test:gateway
# 원래 터미널에서
npm run test:seed
npm run test:rls
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:operations
```

로컬 서비스 시작은 빈 테스트 환경에만 실행합니다. 이미 컨테이너가 있으면 설정을 덮어쓰지 않고 중단합니다. 테스트 재실행에는 기존 컨테이너와 게이트웨이를 사용하세요. 운영 브라우저 테스트는 실제 Auth 세션과 PostgREST를 사용하며 3001 포트에 빌드 서버를 자동 시작·종료합니다. 합성 원고를 추가로 저장하며 실제 DB에 남겨 영속성을 검증합니다. PostgreSQL RLS 테스트는 각 테스트 트랜잭션을 롤백합니다.

로컬 테스트 스택을 **완전히 폐기하려는 경우에만** 다음을 실행합니다. 합성 DB와 계정이 삭제됩니다. 해당 이름은 테스트 전용입니다.

```bash
docker rm -f sb-phase2a-auth sb-phase2a-rest sb-phase2a-db
docker network rm sb-phase2a-test
```

게이트웨이를 Ctrl+C로 종료합니다. `.env.local`의 합성 환경 설정도 테스트 종료 후 안전하게 제거/교체하세요. 실제 프로젝트 설정을 지우면 안 됩니다. Docker 서비스·게이트웨이 프로세스가 클라우드 스냅샷에서 자동 복원된다고 가정하지 않습니다.

## Phase 1 회귀 확인

```bash
npm run lint
npm run typecheck
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

기존 12개 브라우저 테스트는 그대로 유지하며 APP_MODE=demo인 전용 프로덕션 서버로 검사합니다. 현재 포트는 3004이며 빌드를 자동 실행합니다. API 값이 있어도 강제 데모 모드에서는 Auth/DB에 연결하지 않습니다.

## 남은 범위와 위험

- 실제 호스팅 Supabase·실서비스 HTTPS·메일·배포 환경은 사용자가 설정한 후 별도 확인이 필요합니다. 로컬 통과가 실제 배포 검증을 대신하지 않습니다.
- MFA, 셀프 비밀번호 복구/초대 화면, 계정 삭제, 원고 삭제·복구·보존 기간 및 전체 관리자 작업 감사 로그는 아직 구현하지 않았습니다. 중요 계정 MFA는 후속 우선 과제입니다.
- Supabase 로그아웃은 현재 세션의 refresh token을 무효화합니다. 탈취된 기존 access JWT는 만료 전까지 유효할 수 있습니다. 짧은 JWT 수명과 HTTPS가 필요합니다. 교회 멤버십을 중지하면 RLS는 기존 JWT가 있어도 교회 데이터를 즉시 차단합니다. 사용자 계정 ban만을 교회 권한 해제 대신 사용하지 마세요.
- 같은 교회의 media도 모든 교회 원고를 읽고 수정할 수 있습니다. 담당자별 개인 초안 격리는 별도 기능입니다.
- 담당자가 읽을 수 있는 화면 내용의 복사/스크린샷을 방지하는 DRM은 없습니다. 강제 로그아웃 후 브라우저에 이미 표시된 화면이나 파일까지 회수할 수 없습니다.
- 비밀번호 로그인 실패는 일반 메시지로 표시합니다. 로그인 공격 방어는 Supabase의 속도 제한/비밀번호 정책과 필요시 CAPTCHA를 함께 설정해야 합니다.
- AI·익명 공개·스토리지·Realtime은 아직 연결하지 않았습니다. 새 테이블·공개 RPC 추가 시 같은 교회 격리/익명 접근 테스트를 확장해야 합니다.
