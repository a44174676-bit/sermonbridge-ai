# SermonBridge AI — Gemini 장면 이미지 기능 (개발 초안)

## 목표
설교 원고를 분석해 생성한 3~5개 장면의 `visual_description`을 기반으로, 실제 Gemini Image API를 호출해 **장면별 16:9 PNG**를 만들고, 비공개 스토리지에서 **담당자 생성 / 목회자·관리자 승인 / 재생성**을 수행한다.

### 흐름
1. 설교 분석에 `scenes[].visual_description`가 저장돼 있어야 함.
2. `/scene-images/{sermonId}` 화면에서 담당자가 장면별 이미지 생성 버튼 클릭.
3. 서버는 Supabase 사용자 세션과 교회 구성원 역할 및 원고·분석 버전 확인.
4. 서버 전용 서비스 권한 RPC `reserve_scene_image`가 요청 충돌, 승인 여부와 횟수를 검사.
5. **Gemini `gemini-2.5-flash-image` 이미지 생성 API** 호출 → PNG 크기 검사.
6. 비공개 Storage Bucket에 저장, `sermon_scene_images` 기록.
7. 관리자/목회자가 이미지를 확인 후 승인. 교회 담당자는 승인 불가.
8. 이미지 요청이 실패하면 실패 기록을 남기고 재시도 가능.
9. 변경된 원고·분석 버전과 맞지 않는 이미지는 표시하지 않음.

## 생성된 파일
- `supabase/migrations/202610230001_scene_images.sql`
- `src/lib/ai/scene-image.ts`
- `src/app/scene-images/actions.ts`
- `src/app/scene-images/[sermonId]/page.tsx`
- `src/app/scene-images/[sermonId]/panel.tsx`

## 중요한 제한 및 배포 차단 사항
- 개발 초안이며 **실제 Gemini 이미지 호출 0회, 테스트 및 빌드 미검증**.
- **이미지 생성 비용의 실시간 단가 예약·전역 예산 상한 통합 미구현.** RPC의 사용자당 하루 최대 12건/설교당 15건은 **비용 상한을 대체하지 않음.**
- 이미지 모델의 실제 API 응답 형식(PNG), 사용 가능 여부, Google 사용요금/지역 제한 확인 필요.
- 현재 사용자 Netlify `APP_MODE=demo`; 기존 운영 모드 로그인 오류 해결 필요.
- `SUPABASE_SERVICE_ROLE_KEY`는 반드시 Netlify 서버 전용 Secret으로 사용. 키 값을 채팅/코드에 기록하지 말 것.
- 운영 DB SQL **미적용**. Netlify production/기존 GitHub main **미변경**.
- 목회자 검수 후 승인했어도 공개 모바일 플레이어 / 프로젝터에 자동 반영하는 기능 **미구현**. 현재는 관리자 미리보기 단계.
- 원문 변경 시 과거 `approved` 이미지가 DB에 남을 수 있으므로, 실제 공개 조회 시 원고·분석 버전 검사 필수.
- 이미지 재생성 시 과거 승인 이미지의 폐기·우선순위 정책과 삭제/보존 정책 미구현.
- YouTube 콘텐츠/설교 원고에 대한 업로드 권한과 사용 범위 확인 필요.

## 필수 다음 개발 과제
1. Build, typecheck, lint, DB RLS·RPC 보안 시험.
2. 이미지 생성 단위 사전 예산 예약, 청구액 검증, 동시성·실패 시 정산·자동 만료.
3. 실제 Gemini 이미지 API의 PNG/JPEG mime을 확인하고 안전한 변환 방식을 지원.
4. 기존 /sermons/{id} 페이지에 이미지 관리 링크 추가.
5. 승인 후 모바일/예배 화면에 표시할 때 이미지의 유효 버전과 권한을 매 요청 확인.
6. 목회자 초안/승인 일관성, 사용자별 재시도 제한 및 운영 로그 검증.

## 2026-10-23 후속 코드 점검
- 유료 호출 기본 차단: `IMAGE_GENERATION_ENABLED=true`를 명시하지 않으면 서버 작업 예약 및 API 호출 불가.
- 관리 화면에서 서버 키가 없어도 전체 화면이 즉시 중단되지 않도록 읽기 전용 처리를 보완.
- Google 공식 Gemini 문서에서 `gemini-2.5-flash-image`의 16:9 `imageConfig`를 확인. 실제 API 응답/권한/과금 검증 전이라는 점은 변하지 않음.
- 현재 환경에서는 GitHub 저장소를 로컬로 clone할 수 없어 npm lint/typecheck/build는 실행하지 못함.
- **운영 전 필수**: 빌드, 실제 세션/DB RLS/SQL 마이그레이션 테스트, 예산 제한, 유효 이미지 관리, 메인 설교 화면 진입 링크, 승인 이미지 모바일 화면 반영.
