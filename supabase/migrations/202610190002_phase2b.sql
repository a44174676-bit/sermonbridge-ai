begin;
-- Additive migration: existing sources, sections, translations and reviews remain intact.
alter table public.sermons add column source_version integer not null default 1,
 add column analysis_version integer not null default 0,
 add column review_requested_at timestamptz, add column review_requested_by uuid references auth.users(id);
alter table public.translations drop constraint translations_language_check;
alter table public.translations add constraint translations_language_check check(language in ('ko','en','vi','ja','zh-CN'));
create table public.ai_policy (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 model text not null default 'gpt-4.1-mini', input_usd_per_million numeric not null default 1 check(input_usd_per_million>0),
 output_usd_per_million numeric not null default 5 check(output_usd_per_million>0),
 max_output_tokens integer not null default 12000 check(max_output_tokens between 1000 and 16000),
 max_job_usd numeric not null default 0.50 check(max_job_usd>0), user_requests_per_hour integer not null default 6 check(user_requests_per_hour between 1 and 100),
 church_daily_usd numeric not null default 5 check(church_daily_usd>0), global_daily_usd numeric not null default 10 check(global_daily_usd>0)
);
-- Pricing values are unverified examples; disabled until an operator verifies model/prices and enables SQL policy.
insert into public.ai_policy(singleton) values(true);
create table public.sermon_analyses (
 sermon_id uuid primary key, church_id uuid not null, source_version integer not null,
 data jsonb not null check(jsonb_typeof(data)='object'), edited_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(sermon_id,church_id) references public.sermons(id,church_id)
);
create table public.sermon_translations (
 id uuid primary key default gen_random_uuid(), sermon_id uuid not null, church_id uuid not null,
 language text not null check(language in ('ko','en','vi','ja','zh-CN')), source_version integer not null, analysis_version integer not null,
 full_text text not null, paragraphs jsonb not null check(jsonb_typeof(paragraphs)='array'),
 scenes jsonb not null check(jsonb_typeof(scenes)='array'), content_revision integer not null default 1,
 edited_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(sermon_id,church_id) references public.sermons(id,church_id), unique(sermon_id,language)
);
create table public.generation_jobs (
 id uuid primary key default gen_random_uuid(), sermon_id uuid not null, church_id uuid not null, requested_by uuid not null references auth.users(id), request_key uuid not null,
 kind text not null check(kind in ('analysis','translation')), language text not null check(language in ('ko','en','vi','ja','zh-CN')),
 status text not null default 'running' check(status in ('running','succeeded','failed')),
 source_version integer not null, analysis_version integer not null, output_version integer not null default 0,
 source_snapshot jsonb not null, model text not null, prompt_version text not null default 'phase2b-v1', estimated_input_tokens integer not null check(estimated_input_tokens>0),
 max_output_tokens integer not null, input_tokens integer, output_tokens integer,
 input_rate numeric not null, output_rate numeric not null, reserved_usd numeric not null, accounted_usd numeric not null,
 usage_known boolean not null default false, failure_code text, response_id text, result_snapshot jsonb,
 deadline timestamptz not null default now()+interval '3 minutes', created_at timestamptz not null default now(), completed_at timestamptz,
 foreign key(sermon_id,church_id) references public.sermons(id,church_id), unique(requested_by,request_key),
 check(kind<>'analysis' or language='ko')
);
create unique index one_active_generation on public.generation_jobs(sermon_id,kind,language) where status='running';
create index jobs_by_actor_time on public.generation_jobs(requested_by,created_at);
create index jobs_by_church_time on public.generation_jobs(church_id,created_at);

do $$ declare t text; begin
 foreach t in array array['ai_policy','sermon_analyses','sermon_translations','generation_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t<>'ai_policy' then execute format('create policy church_read on public.%I for select to authenticated using(private.church_role(church_id) is not null)',t); end if;
 end loop;
end $$;
create policy policy_read on public.ai_policy for select to authenticated using(true);

create or replace function private.invalidate_sermon() returns trigger language plpgsql set search_path='' as $$
begin
 if new.title is distinct from old.title or new.source is distinct from old.source or new.scripture is distinct from old.scripture then
 new.status='draft';new.approved_by=null;new.approved_at=null;new.revision=old.revision+1;new.source_version=old.source_version+1;
 new.review_requested_at=null;new.review_requested_by=null;
 end if;return new;
end $$;
create function private.invalidate_generated() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.sermons set status='draft',approved_by=null,approved_at=null,revision=revision+1,
 analysis_version=analysis_version+case when tg_table_name='sermon_analyses' then 1 else 0 end,
 review_requested_at=null,review_requested_by=null where id=new.sermon_id;
 new.updated_at=now();return new;
end $$;
create trigger invalidate_generated after insert or update on public.sermon_analyses for each row execute function private.invalidate_generated();
create trigger invalidate_generated after insert or update on public.sermon_translations for each row execute function private.invalidate_generated();

create trigger touch_updated_at before update on public.sermon_analyses for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.sermon_translations for each row execute function private.touch_updated_at();

-- These worker RPCs are callable only with the server-side service role, never with a user's JWT.
create function public.begin_generation(target uuid, actor uuid, job_kind text, job_language text, idempotency_key uuid, expected_source integer, expected_analysis integer, model_name text, input_bound integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.ai_policy;s public.sermons;j public.generation_jobs;reserve numeric;v integer;day_start timestamptz;
begin
 select * into p from public.ai_policy where singleton for update; -- global serialized budget/rate-limit reservation
 select * into s from public.sermons where id=target for update;
 if not found or not exists(select 1 from public.church_memberships where church_id=s.church_id and user_id=actor and active) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into j from public.generation_jobs where requested_by=actor and request_key=idempotency_key;
 if found then return to_jsonb(j)||jsonb_build_object('claimed',false);end if;
 if not p.enabled or model_name<>p.model then raise exception 'AI_POLICY_DISABLED';end if;
 if job_kind not in ('analysis','translation') or job_language not in ('ko','en','vi','ja','zh-CN') or (job_kind='analysis' and job_language<>'ko') then raise exception 'INVALID_JOB';end if;
 if s.source_version<>expected_source or s.analysis_version<>expected_analysis then raise exception 'STALE_SOURCE';end if;
 if input_bound not between 1 and 100000 or length(s.source)>20000 then raise exception 'SOURCE_LIMIT';end if;
 if job_kind='translation' and not exists(select 1 from public.sermon_analyses where sermon_id=target and source_version=s.source_version) then raise exception 'ANALYSIS_REQUIRED';end if;
 update public.generation_jobs set status='failed',failure_code='TIMEOUT_UNKNOWN_USAGE',completed_at=now() where status='running' and deadline<now();
 if exists(select 1 from public.generation_jobs where sermon_id=target and kind=job_kind and language=job_language and status='running') then raise exception 'DUPLICATE_JOB';end if;
 if (select count(*) from public.generation_jobs where requested_by=actor and created_at>now()-interval '1 hour')>=p.user_requests_per_hour then raise exception 'RATE_LIMIT';end if;
 reserve=(input_bound*p.input_usd_per_million+p.max_output_tokens*p.output_usd_per_million)/1000000;
 day_start=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if reserve>p.max_job_usd or reserve+coalesce((select sum(accounted_usd) from public.generation_jobs where church_id=s.church_id and created_at>=day_start),0)>p.church_daily_usd
 or reserve+coalesce((select sum(accounted_usd) from public.generation_jobs where created_at>=day_start),0)>p.global_daily_usd then raise exception 'BUDGET_LIMIT';end if;
 select content_revision into v from public.sermon_translations where sermon_id=target and language=job_language;
 insert into public.generation_jobs(sermon_id,church_id,requested_by,request_key,kind,language,source_version,analysis_version,output_version,source_snapshot,model,estimated_input_tokens,max_output_tokens,input_rate,output_rate,reserved_usd,accounted_usd)
 values(target,s.church_id,actor,idempotency_key,job_kind,job_language,s.source_version,s.analysis_version,coalesce(v,0),jsonb_build_object('title',s.title,'source',s.source,'scripture',s.scripture),model_name,input_bound,p.max_output_tokens,p.input_usd_per_million,p.output_usd_per_million,reserve,reserve) returning * into j;
 update public.sermons set status='draft',approved_by=null,approved_at=null,revision=revision+1,review_requested_at=null,review_requested_by=null where id=target;
 return to_jsonb(j)||jsonb_build_object('claimed',true);
end $$;
create function public.finish_generation(job_id uuid,payload jsonb,used_input integer,used_output integer,reason text,provider_response text)
returns text language plpgsql security definer set search_path='' as $$
declare j public.generation_jobs;s public.sermons;v integer;failure text:=reason;cost numeric;
begin
 perform 1 from public.ai_policy where singleton for update;
 select * into j from public.generation_jobs where id=job_id for update;
 if not found then raise exception 'JOB_NOT_FOUND';end if;
 if j.status<>'running' then return j.status;end if;
 if used_input is not null and used_output is not null and used_input>=0 and used_output>=0 then
 cost=(used_input*j.input_rate+used_output*j.output_rate)/1000000;
 if cost>j.reserved_usd then failure='USAGE_BOUND_EXCEEDED';update public.ai_policy set enabled=false;end if;
 else cost=j.reserved_usd;end if;
 select * into s from public.sermons where id=j.sermon_id for update;
 if j.deadline<now() then failure='TIMEOUT_UNKNOWN_USAGE';end if;
 if not exists(select 1 from public.church_memberships where church_id=j.church_id and user_id=j.requested_by and active) then failure='ACCESS_REVOKED';end if;
 if s.source_version<>j.source_version or s.analysis_version<>j.analysis_version then failure='STALE_SOURCE';end if;
 if j.kind='translation' then
 select content_revision into v from public.sermon_translations where sermon_id=j.sermon_id and language=j.language;
 if coalesce(v,0)<>j.output_version then failure='EDIT_CONFLICT';end if;
 end if;
 if payload is null and failure is null then failure='EMPTY_OUTPUT';end if;
 if failure is null then
 if j.kind='analysis' then
 insert into public.sermon_analyses(sermon_id,church_id,source_version,data) values(j.sermon_id,j.church_id,j.source_version,payload)
 on conflict(sermon_id) do update set source_version=excluded.source_version,data=excluded.data,edited_by=null;
 else
 insert into public.sermon_translations(sermon_id,church_id,language,source_version,analysis_version,full_text,paragraphs,scenes)
 values(j.sermon_id,j.church_id,j.language,j.source_version,j.analysis_version,case when j.language='ko' then s.source else (select string_agg(item->>'text',E'\n\n' order by ord) from jsonb_array_elements(payload->'paragraphs') with ordinality as a(item,ord)) end,payload->'paragraphs',payload->'scenes')
 on conflict(sermon_id,language) do update set source_version=excluded.source_version,analysis_version=excluded.analysis_version,full_text=excluded.full_text,paragraphs=excluded.paragraphs,scenes=excluded.scenes,content_revision=public.sermon_translations.content_revision+1,edited_by=null;
 end if;
 end if;
 update public.generation_jobs set status=case when failure is null then 'succeeded' else 'failed' end,accounted_usd=cost,
 input_tokens=used_input,output_tokens=used_output,usage_known=(used_input is not null and used_output is not null),failure_code=failure,response_id=provider_response,
 result_snapshot=case when failure is null then payload else null end,completed_at=now() where id=job_id;
 return case when failure is null then 'succeeded' else 'failed' end;
end $$;
create function public.expire_generation_jobs() returns void language sql security definer set search_path='' as $$
 update public.generation_jobs set status='failed',failure_code='TIMEOUT_UNKNOWN_USAGE',completed_at=now() where status='running' and deadline<now();
$$;
create function public.edit_generated(target uuid,actor uuid,expected_revision integer,kind text,lang text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.sermons;begin
 select * into s from public.sermons where id=target for update;
 if not found or not exists(select 1 from public.church_memberships where church_id=s.church_id and user_id=actor and active) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if s.revision<>expected_revision then raise exception 'EDIT_CONFLICT';end if;
 if kind='analysis' then
 update public.sermon_analyses set data=payload,edited_by=actor where sermon_id=target and source_version=s.source_version;
 else
 update public.sermon_translations set paragraphs=payload->'paragraphs',scenes=payload->'scenes',full_text=case when lang='ko' then s.source else (select string_agg(item->>'text',E'\n\n' order by ord) from jsonb_array_elements(payload->'paragraphs') with ordinality as a(item,ord)) end,content_revision=content_revision+1,edited_by=actor where sermon_id=target and language=lang and source_version=s.source_version and analysis_version=s.analysis_version;
 end if;
 if not found then raise exception 'STALE_SOURCE';end if;
end $$;
create function public.request_sermon_review(target uuid,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare s public.sermons;begin
 select * into s from public.sermons where id=target for update;
 if not found or private.church_role(s.church_id) is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if s.revision<>expected_revision then raise exception 'EDIT_CONFLICT';end if;
 update public.sermons set review_requested_at=now(),review_requested_by=auth.uid() where id=target;
end $$;
-- Keep the Phase 2A reviewer role check; additionally prevent approval of stale/in-flight generated material.
create or replace function public.review_sermon(target uuid,expected_revision integer,decision text,note text default '') returns void language plpgsql security definer set search_path='' as $$
declare s public.sermons;begin
 select * into s from public.sermons where id=target for update;
 if not found or coalesce(private.church_role(s.church_id),'') not in ('admin','pastor') then raise exception 'permission denied' using errcode='42501';end if;
 if s.revision<>expected_revision then raise exception 'stale revision' using errcode='40001';end if;
 if decision not in ('approved','reopened') or decision is null then raise exception 'invalid decision';end if;
 if decision='approved' and (exists(select 1 from public.generation_jobs where sermon_id=target and status='running')
 or exists(select 1 from public.sermon_analyses where sermon_id=target and source_version<>s.source_version)
 or exists(select 1 from public.sermon_translations where sermon_id=target and (source_version<>s.source_version or analysis_version<>s.analysis_version))) then raise exception 'STALE_OR_RUNNING_GENERATION';end if;
 insert into public.reviews(church_id,sermon_id,reviewer_id,decision,revision,note) values(s.church_id,s.id,auth.uid(),decision,s.revision,note);
 update public.sermons set status=case when decision='approved' then 'approved' else 'draft' end,approved_by=case when decision='approved' then auth.uid() else null end,approved_at=case when decision='approved' then now() else null end where id=target;
end $$;
revoke all on function private.invalidate_generated() from public,anon,authenticated;
revoke all on function public.begin_generation(uuid,uuid,text,text,uuid,integer,integer,text,integer),public.finish_generation(uuid,jsonb,integer,integer,text,text),public.expire_generation_jobs(),public.edit_generated(uuid,uuid,integer,text,text,jsonb),public.request_sermon_review(uuid,integer) from public,anon,authenticated;
grant execute on function public.begin_generation(uuid,uuid,text,text,uuid,integer,integer,text,integer),public.finish_generation(uuid,jsonb,integer,integer,text,text),public.expire_generation_jobs(),public.edit_generated(uuid,uuid,integer,text,text,jsonb) to service_role;
grant execute on function public.request_sermon_review(uuid,integer) to authenticated;
commit;
