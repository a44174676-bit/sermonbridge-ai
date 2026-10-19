# Phase 1 검증 기록

## 설치 중 발견 및 해결한 문제

- 클라우드 홈 디렉터리의 npm 캐시/생성기 설정 디렉터리를 쓸 수 없어 실패: npm 캐시를 `/workspace/.npm-cache`, 생성기 설정 위치를 `/workspace/.config`로 지정하여 해결.
- 기본 Next.js 생성기의 Node 20 타입 정의와 최신 Vitest의 Node 22/24 타입 요구가 충돌: 실제 Node 24 런타임에 맞춰 `@types/node`를 24로 변경. 강제 설치나 의존성 검사 우회는 하지 않음.

## 자동 검증 범위

- 입력 길이·TXT 파일 제한·저장 자료 구조를 단위 테스트.
- 데스크톱·모바일에서 8개 화면 렌더링 및 가로 넘침 확인.
- 원고 등록·새로고침 보존·공개 샘플과의 분리·미지원 경로 404.
- 검수 동의·검수 완료·수정 후 재검수 상태.
- 베트남어 전환·글자 크기 변경·이전/다음 장면.
- TXT 업로드·지원하지 않는 파일 거부·손상된 브라우저 저장 자료 복구.

서버 인증/RLS 접근 권한 테스트는 해당 기능 구현 후 진행합니다. 현재 경로 분리 테스트가 인증 보안을 보장하지는 않습니다.

## 빌드·브라우저 검증 중 수정

- Next.js 16.4의 Cache Components에서는 런타임 경로에 사전 렌더링 처리가 필요하고 `dynamicParams` 옵션을 사용할 수 없음. 패키지에 포함된 공식 가이드를 확인해 `generateStaticParams`와 명시적인 `notFound()`를 사용하고 Partial Prefetching을 끔.
- Next.js Activity가 이전 페이지 DOM을 숨긴 상태로 보존하므로 테스트의 전체 `h1` 선택이 두 요소를 선택함. 사용자가 실제로 보는 접근성 heading 역할로 검사하도록 수정.
- Playwright 브라우저 다운로드 도메인이 환경 정책으로 403을 반환. 이미 설치된 `/usr/bin/chromium`을 사용했으며 네트워크 정책을 확장하지 않음.
- Playwright trace 파일 기록 중 ENOENT가 발생. 기능 검증은 그대로 유지하고 실패 스크린샷으로 진단 결과를 남기도록 설정.

## 최종 결과

- `npm run lint`: 통과.
- `npm run typecheck`: 통과, strict TypeScript 오류 없음.
- `npm test`: 단위 테스트 3/3 통과.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 데스크톱 6개 + 모바일 6개, 총 12/12 통과.
- `npm run build`: 프로덕션 빌드 통과.
- 미지원 경로의 응답은 실제 404. 개발 서버가 이 경로 검사 시 Next.js의 `instant` 검증 로그를 추가 출력하지만 정상 화면·빌드·테스트에는 실패가 없음.

실제 Supabase/Auth/RLS/OpenAI/실시간 기능은 아직 없어 검증하지 않았습니다. 웹 접근성 수동 검사와 실제 휴대전화·보조기기 검증은 후속 과제입니다.
