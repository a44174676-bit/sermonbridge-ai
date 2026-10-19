# SermonBridge AI

외국인 이웃·다문화가정·새신자가 자신의 언어로 설교를 이해하도록 돕는 웹 앱입니다.

## 현재 상태: Phase 2B 코드·로컬 검증 완료, 실제 AI 호출 검증 필요

**Phase 2B:** 원문 근거를 검증하는 설교 분석, 5개 언어 번역, 영구 저장, 비교 편집·검수, 사용량·비용 제한을 추가했습니다. 실제 OpenAI 키가 없어 유료 호출은 검증하지 못했습니다. [설정·사용 방법](docs/phase-2b-setup.md)과 [테스트 결과·제한](docs/phase-2b-validation.md)을 확인하세요.

이 문서 아래의 Phase 1 설명은 **데모 모드**에 해당합니다. Supabase 인증·교회별 원고 영구 저장·DB RLS·역할 관리·검수 승인을 추가했습니다. 운영 설정과 SQL 적용 방법은 [Phase 2A 안내](docs/phase-2a-setup.md)를 먼저 읽으세요. [검증 결과](docs/phase-2a-validation.md)에 DB 권한 테스트와 브라우저 테스트 결과를 기록했습니다. `APP_MODE=demo` 또는 Supabase 설정이 없으면 기존 데모가 실행됩니다. 운영 연결이 있으면 `/demo`에서 기존 체험 화면을 사용할 수 있습니다.

## Phase 1 데모 기능

Next.js App Router, React, TypeScript strict, Tailwind CSS로 구현한 실행 가능한 UI 데모입니다. API 키 없이 실행됩니다. **이 데모 모드에서는 실제 인증·DB 저장을 사용하지 않습니다.** 운영 인증·저장·검수는 Phase 2A에서 별도로 구현했습니다. 데모의 AI 분석·번역은 샘플이며 실제 API를 호출하지 않습니다. 운영 AI 분석·번역은 Phase 2B에서 구현했습니다. 그림 생성, 외부 공개, QR 생성, 기기 간 동기화, 다운로드는 아직 미구현입니다. 버튼이나 문구로 이 기능들이 작동한다고 표시하지 않습니다.

테스트 자료: 2026년 10월 18일, 사사기 4:14–21, 「하나님의 승리에 참여하려면?」. 핵심 대지는 ‘앞서 행하시는 하나님을 믿고 따라가라’, ‘어떤 상황에서도 하나님의 편에 서라’입니다. **목사님의 전체 원고가 아닌 제공된 테스트용 요약**입니다. 영문·베트남어와 보충 설명은 검수 전 샘플이며 원고의 실제 번역 결과가 아닙니다. 그래픽은 장식용 SVG로, AI 그림이나 성경 장면의 역사적 복원이 아닙니다.

## 실행

Node.js 22.12 이상(검증 환경: 24), npm을 사용합니다.

```bash
cd /workspace/sermonbridge-ai
npm ci
APP_MODE=demo npm run dev -- --hostname 0.0.0.0
```

`dev`는 개발 서버를 켭니다. 기본 포트는 3000입니다. 개발 도구의 포트 열기 기능 또는 로컬 브라우저에서 해당 포트로 접속합니다. 환경변수 없이 Demo Mode로 작동합니다. 클라우드에서 npm 캐시 권한 오류가 나면 명령 앞에 `npm_config_cache=/workspace/.npm-cache`를 붙입니다.

```bash
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

`build`는 배포용 결과물을 만들고, `start`는 빌드한 서버를 실행합니다. 데모 E2E 테스트는 빌드 후 3004 포트에서 전용 프로덕션 서버를 자동으로 시작합니다. 해당 포트가 비어 있어야 합니다. 이 클라우드에서는 브라우저가 이미 설치되어 있어 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`로 실행합니다. 다운로드가 필요 없습니다. Linux에 브라우저 라이브러리가 없으면 Playwright 공식 설치 안내에 따라 시스템 의존성을 설치해야 합니다.

## 화면 확인 순서

1. `/`: 소개 및 샘플 진입.
2. `/login`: 실제 계정을 받지 않는 데모 진입 화면.
3. `/dashboard`: 샘플과 이 탭에 등록한 원고 목록.
4. `/sermons/new`: 제목·텍스트 또는 UTF-8 TXT 입력. 최대 20,000자, 파일 최대 80KB.
5. `/sermons/demo`: 샘플 분석·원문·3개 언어 수정. 직접 등록한 원고는 `/sermons/local`.
6. `/sermons/demo/review`: 검수 체험. 문구 수정 시 승인 상태 초기화. 실제 공개는 하지 않음.
7. `/present/demo`: 수동 장면 이동 프레젠테이션.
8. `/s/demo`: 3개 언어·글자 크기·장면 이동·용어 설명을 제공하는 모바일 샘플.

등록한 원고에는 가짜 AI 결과를 연결하지 않습니다. 원문을 바꿔도 샘플 결과는 자동으로 바뀌지 않습니다. `/s/demo`는 고정된 샘플 자료의 체험 경로이며 이 탭에서 수정한 샘플 번역만 반영합니다. 직접 입력한 원고를 공개하는 경로는 없습니다. 알려지지 않은 ID/slug는 404입니다.

## 데모의 저장과 보안 범위

브라우저 `sessionStorage`에 테스트 입력을 저장합니다. 서버 전송·영구 저장·사용자 인증은 없습니다. 탭을 닫거나 저장소를 지우면 변경사항이 사라질 수 있습니다. **실제 비공개 원고나 개인정보를 넣지 마세요.** 클라이언트의 검수 상태는 접근 제어가 아니며 서버 승인에 사용할 수 없습니다. 실제 배포는 공개 샘플 데모에 한정하세요.

입력은 React 텍스트로 렌더링하고 HTML로 실행하지 않습니다. TXT 확장자·크기·UTF-8 디코딩·길이를 검사합니다. 이는 UI 검증이며 향후 API에서 별도로 검증해야 합니다. 저장 자료는 Zod로 구조를 검증합니다. `.env.local`과 실제 비밀키는 Git에서 제외하며 `.env.example`만 공유합니다. 공개 환경변수에 서버 비밀키를 넣지 마세요.

접근성: 본문 바로가기, 입력 레이블, 키보드 포커스, 상태 메시지, 큰 버튼, 줄바꿈·반응형 레이아웃, 언어 속성, 이미지 설명, 글자 크기 조절을 제공합니다. WCAG 인증이나 보조기기 전수 검증을 의미하지 않습니다.

## 다음 단계의 구현 순서

- Phase 2A 완료: Supabase Auth·교회별 DB/RLS·권한 관리·원고 저장·검수 승인. 실제 프로젝트에 설정 후 검증 필요.
- Phase 2B 코드·로컬 검증 완료: 분석·5언어 번역·근거 검증·검수·비용 제한. 실제 API 키와 검증된 단가를 설정한 뒤 실사용 검증 필요.
- Phase 3: 3장 기본·최대 5장, 비용 확인, 16:9 교육용 그림, 저장·장면별 재시도·교체. 자막은 별도 레이어. 역사적 복원으로 오인하지 않는 안내.
- Phase 4: 승인된 자료만 익명으로 읽는 QR 뷰어. 진행자 권한과 참석자 읽기 권한을 분리한 Realtime 동기화. 직접 읽기 모드·연결 해제 시 수동 이동 유지. 국적·신앙 정보 수집 및 마이크 인식 없음.
- Phase 5: 서버 검수·최종 승인·공개 해제 흐름, 인쇄/PDF·PNG 내보내기, 접근 제어·비용·장애·접근성 테스트. PPTX는 후속.

현재 SQL 마이그레이션은 churches, profiles, church_memberships, sermons, sermon_sections, translations, reviews를 포함합니다. Phase 2B는 sermon_analyses, sermon_translations, generation_jobs, ai_policy를 추가합니다. image_assets와 presentation_sessions는 후속 단계에서 추가합니다.

## Vercel / GitHub

Vercel에서 Next.js 프로젝트로 가져올 수 있습니다. 빌드 명령은 `npm run build`, 출력 디렉터리는 기본값입니다. Phase 1은 외부 서비스 설정이 필요 없습니다. 이 작업에서는 GitHub push나 Vercel 배포를 실행하지 않았습니다.

## 실사용 검증 준비

호스팅 SQL 적용 순서·환경변수·공개 시험 원고·5언어 검수표는 [실사용 검증 안내](docs/live-validation/README.md)를 확인하세요. 운영 DB 변경과 실제 API 호출은 아직 수행하지 않았습니다.
