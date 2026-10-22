# Gemini 연결 (시험 기능)

현재 production Netlify의 `APP_MODE=demo`는 **그대로 유지**합니다. Gemini provider 코드는 실사용 검증 이전의 별도 브랜치입니다.

## 선행 조건
1. Supabase에서 Phase 2A/2B 적용·관리자 계정 및 교회 관리 권한 확인.
2. Netlify 인증 운영 모드 문제 해결 및 서버 500 로그 확인.
3. Gemini API 키를 발급받아 **Netlify의 서버 비밀 환경변수**에만 입력. 채팅·Git에 넣지 않음.
4. `SUPABASE_SERVICE_ROLE_KEY`도 서버에서만 관리. DB 관리자 권한이므로 외부 공개 금지.
5. 실제 선택 모델이 JSON Schema 출력과 90초 제한을 지원하는지 확인.

## 운영 환경변수
```
APP_MODE=auto
NEXT_PUBLIC_SUPABASE_URL=(기존 값 유지)
NEXT_PUBLIC_SUPABASE_ANON_KEY=(기존 값 유지)
AI_PROVIDER=gemini
GEMINI_API_KEY=(서버 비밀)
OPENAI_MODEL=gemini-2.5-flash
SUPABASE_SERVICE_ROLE_KEY=(서버 비밀)
```

`OPENAI_MODEL`이라는 기존 변수명은 DB `ai_policy.model`과 호환성을 위해 임시 유지합니다. 서비스 제공자는 `AI_PROVIDER`로 구분합니다. 기존 OpenAI 서버 코드는 삭제하지 않았습니다.

## 비용 차단
- DB의 `ai_policy.enabled` 초기값은 **false**입니다.
- 공식 Gemini 모델별 입출력 토큰 가격을 실제로 확인하여 `ai_policy`의 단가·예산 상한·모델명을 일치시킨 뒤에만 활성화합니다.
- Gemini thinking tokens를 포함한 총 토큰 사용량에서 입력 토큰을 뺀 값을 출력 측에 보수적으로 계산하도록 했습니다. 공급자 실제 청구액과 차이가 있을 수 있습니다.
- 공개 원고가 아닌 **합성 테스트 원고**로 분석 1건과 영어·베트남어·일본어·중국어·한국어를 검증합니다.
- 목회자 및 각 언어 검수자의 승인 전 실제 예배 서비스에는 사용하지 않습니다.

## 이번 구현
- `src/lib/ai/gemini.ts` : Gemini REST `generateContent` 구조화 JSON과 토큰 사용량 변환.
- `src/lib/ai/server.ts` : 제공자 선택. 기존 비용 정책·RLS·검수 파이프라인 그대로 유지.
- `.env.example` : 필요한 변수 예시.
- API 키가 없으면 활성화되지 않습니다. 실사용 Gemini 호출 0회.

## 테스트 전 확인할 사항
- `npm run lint && npm run typecheck && npm test && npm run build`
- 실제 API Structured Outputs 스키마 호환성과 과금.
- Netlify 함수 90초 시간제한 및 인증 정상 작동.
- 표준 테스트 원고로 언어별 결과, 원문 근거 및 검수.
