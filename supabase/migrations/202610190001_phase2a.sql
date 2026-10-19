begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.churches (
 id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 120),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=120),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.church_memberships (
 church_id uuid not null references public.churches(id), user_id uuid not null references public.profiles(id),
 role text not null check(role in ('admin','pastor','media')), active boolean not null default true,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(church_id,user_id)
);
create table public.sermons (
 id uuid primary key default gen_random_uuid(), church_id uuid not null references public.churches(id),
 created_by uuid not null default auth.uid() references auth.users(id),
 title text not null check(length(btrim(title)) between 1 and 120),
 source text not null check(length(btrim(source)) between 1 and 20000),
 scripture text not null default '' check(length(scripture)<=200),
 status text not null default 'draft' check(status in ('draft','approved')),
 revision integer not null default 1, approved_by uuid references auth.users(id), approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,church_id), check ((status='draft' and approved_by is null and approved_at is null) or (status='approved' and approved_by is not null and approved_at is not null))
);
create table public.sermon_sections (
 id uuid primary key default gen_random_uuid(), church_id uuid not null, sermon_id uuid not null,
 created_by uuid not null default auth.uid() references auth.users(id), position integer not null check(position between 1 and 100),
 content text not null check(length(content) between 1 and 10000),
 content_kind text not null check(content_kind in ('source','background','summary')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(sermon_id,church_id) references public.sermons(id,church_id) on delete cascade,
 unique(id,sermon_id,church_id), unique(sermon_id,position)
);
create table public.translations (
 id uuid primary key default gen_random_uuid(), church_id uuid not null, sermon_id uuid not null, section_id uuid not null,
 created_by uuid not null default auth.uid() references auth.users(id), language text not null check(language in ('ko','en','vi')),
 content text not null check(length(content) between 1 and 10000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(section_id,sermon_id,church_id) references public.sermon_sections(id,sermon_id,church_id) on delete cascade,
 unique(section_id,language)
);
create table public.reviews (
 id uuid primary key default gen_random_uuid(), church_id uuid not null, sermon_id uuid not null,
 reviewer_id uuid not null references auth.users(id), decision text not null check(decision in ('approved','reopened')),
 revision integer not null, note text not null default '' check(length(note)<=2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(sermon_id,church_id) references public.sermons(id,church_id)
);
create index on public.church_memberships(user_id) where active;
create index on public.sermons(church_id,updated_at desc);
create index on public.sermon_sections(church_id,sermon_id);
create index on public.translations(church_id,sermon_id);
create index on public.reviews(church_id,sermon_id);

-- No role is derived from user-controlled signup metadata.
create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

create function private.church_role(target uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.church_memberships where church_id=target and user_id=(select auth.uid()) and active
$$;
create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create function private.invalidate_sermon() returns trigger language plpgsql set search_path='' as $$
begin
 if new.title is distinct from old.title or new.source is distinct from old.source or new.scripture is distinct from old.scripture then
 new.status='draft'; new.approved_by=null; new.approved_at=null; new.revision=old.revision+1;
 end if; return new;
end $$;
create trigger invalidate_sermon before update on public.sermons for each row execute function private.invalidate_sermon();
create function private.invalidate_parent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.sermons set status='draft',approved_by=null,approved_at=null,revision=revision+1 where id=coalesce(new.sermon_id,old.sermon_id);
 return coalesce(new,old);
end $$;
create trigger invalidate_sections after insert or update or delete on public.sermon_sections for each row execute function private.invalidate_parent();
create trigger invalidate_translations after insert or update or delete on public.translations for each row execute function private.invalidate_parent();

do $$ declare t text; begin
 foreach t in array array['churches','profiles','church_memberships','sermons','sermon_sections','translations','reviews'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
 end loop;
end $$;

grant select on public.churches,public.profiles,public.church_memberships,public.sermons,public.sermon_sections,public.translations,public.reviews to authenticated;
grant update(name) on public.churches to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant insert(church_id,title,source,scripture) on public.sermons to authenticated;
grant update(title,source,scripture) on public.sermons to authenticated;
grant insert(church_id,sermon_id,position,content,content_kind) on public.sermon_sections to authenticated;
grant update(position,content,content_kind) on public.sermon_sections to authenticated;
grant insert(church_id,sermon_id,section_id,language,content) on public.translations to authenticated;
grant update(content) on public.translations to authenticated;
grant delete on public.sermon_sections,public.translations to authenticated;

create policy church_read on public.churches for select to authenticated using(private.church_role(id) is not null);
create policy church_update on public.churches for update to authenticated using(private.church_role(id)='admin') with check(private.church_role(id)='admin');
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy membership_read on public.church_memberships for select to authenticated using(user_id=auth.uid() or private.church_role(church_id)='admin');

do $$ declare t text; begin
 foreach t in array array['sermons','sermon_sections','translations'] loop
 execute format('create policy member_read on public.%I for select to authenticated using(private.church_role(church_id) is not null)',t);
 execute format('create policy member_insert on public.%I for insert to authenticated with check(private.church_role(church_id) is not null and created_by=auth.uid())',t);
 execute format('create policy member_update on public.%I for update to authenticated using(private.church_role(church_id) is not null) with check(private.church_role(church_id) is not null)',t);
 end loop;
end $$;
create policy section_delete on public.sermon_sections for delete to authenticated using(private.church_role(church_id) is not null);
create policy translation_delete on public.translations for delete to authenticated using(private.church_role(church_id) is not null);
create policy review_read on public.reviews for select to authenticated using(private.church_role(church_id) is not null);

-- Atomic approval: row lock + revision check prevents approving a stale editor view.
create function public.review_sermon(target uuid, expected_revision integer, decision text, note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare s public.sermons; begin
 select * into s from public.sermons where id=target for update;
 if not found or coalesce(private.church_role(s.church_id),'') not in ('admin','pastor') then raise exception 'permission denied' using errcode='42501'; end if;
 if s.revision<>expected_revision then raise exception 'stale revision' using errcode='40001'; end if;
 if decision not in ('approved','reopened') or decision is null then raise exception 'invalid decision'; end if;
 insert into public.reviews(church_id,sermon_id,reviewer_id,decision,revision,note) values(s.church_id,s.id,auth.uid(),decision,s.revision,note);
 update public.sermons set status=case when decision='approved' then 'approved' else 'draft' end,
 approved_by=case when decision='approved' then auth.uid() else null end,
 approved_at=case when decision='approved' then now() else null end where id=s.id;
end $$;
-- Church row lock serializes administrator membership changes and protects the last active admin.
create function public.manage_membership(target_church uuid, target_user uuid, new_role text, is_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.churches where id=target_church for update;
 if private.church_role(target_church) is distinct from 'admin' then raise exception 'permission denied' using errcode='42501'; end if;
 if new_role not in ('admin','pastor','media') or new_role is null or is_active is null then raise exception 'invalid membership'; end if;
 if exists(select 1 from public.church_memberships where church_id=target_church and user_id=target_user and active and role='admin')
 and (not is_active or new_role<>'admin') and (select count(*) from public.church_memberships where church_id=target_church and active and role='admin')<=1
 then raise exception 'last administrator cannot be removed' using errcode='23514'; end if;
 insert into public.church_memberships(church_id,user_id,role,active,created_by) values(target_church,target_user,new_role,is_active,auth.uid())
 on conflict(church_id,user_id) do update set role=excluded.role,active=excluded.active;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.church_role(uuid) to authenticated;
revoke all on function public.review_sermon(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.manage_membership(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.review_sermon(uuid,integer,text,text),public.manage_membership(uuid,uuid,text,boolean) to authenticated;
commit;
