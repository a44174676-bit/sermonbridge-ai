"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>자료를 불러오지 못했습니다</h1>
      <p>
        연결 또는 접근 권한을 확인해 주세요. 입력한 내용이 저장되었는지 다시
        확인한 뒤 작업을 계속하세요.
      </p>
      <button onClick={reset}>다시 시도</button>
      <p>
        <Link href="/login">로그인 화면</Link>
      </p>
    </main>
  );
}
