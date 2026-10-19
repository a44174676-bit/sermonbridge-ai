-- Supabase SQL Editor에서만 실행. 브라우저/앱 서버에 이 권한을 부여하지 않습니다.
-- Auth > Users에서 직접 생성한 계정의 UUID와 교회 이름을 대체하세요.
-- 회원가입 metadata, 이메일 문자열 비교로 관리자 권한을 지정하지 않습니다.
begin;
do $$
declare owner_id uuid := '00000000-0000-0000-0000-000000000000'; church uuid;
begin
 if not exists(select 1 from auth.users where id=owner_id) then raise exception '먼저 실제 Auth 사용자 UUID를 입력하세요'; end if;
 insert into public.churches(name,created_by) values('교회 이름을 입력하세요',owner_id) returning id into church;
 insert into public.church_memberships(church_id,user_id,role,created_by) values(church,owner_id,'admin',owner_id);
end $$;
commit;
