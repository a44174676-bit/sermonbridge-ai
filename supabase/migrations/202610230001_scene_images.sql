begin;
create table public.sermon_scene_images (
 id uuid primary key default gen_random_uuid(),
 sermon_id uuid not null, church_id uuid not null,
 scene_id integer not null check (scene_id between 1 and 5),
 source_version integer not null, analysis_version integer not null,
 requested_by uuid not null references auth.users(id),
 prompt text not null check (length(prompt) between 1 and 3000),
 model text not null,
 storage_path text,
 mime_type text,
 status text not null default 'running' check (status in ('running','generated','approved','failed')),
 error_code text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 foreign key (sermon_id,church_id) references public.sermons(id,church_id)
);
create unique index scene_image_running_unique on public.sermon_scene_images(sermon_id,scene_id) where status='running';
create index scene_image_by_church on public.sermon_scene_images(church_id,created_at desc);
alter table public.sermon_scene_images enable row level security;
revoke all on public.sermon_scene_images from public,anon,authenticated;
grant select on public.sermon_scene_images to authenticated;
create policy church_images_read on public.sermon_scene_images for select to authenticated
 using(private.church_role(church_id) is not null);
-- The image bucket is private; only the server service role writes and signs URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sermon-scene-images','sermon-scene-images',false,6291456,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
-- Only the server's privileged database client may reserve an image generation slot.
-- Serializes attempts per sermon and enforces a conservative hard daily request cap.
create function public.reserve_scene_image(
 target uuid, actor uuid, requested_scene integer, expected_source integer,
 expected_analysis integer, requested_prompt text, requested_model text
) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.sermons; a public.sermon_analyses; v uuid; scene jsonb;
begin
 if auth.role() <> 'service_role' then raise exception 'SERVER_ONLY' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,0));
 select * into s from public.sermons where id=target for update;
 if not found or not exists(
   select 1 from public.church_memberships where church_id=s.church_id and user_id=actor
     and active and role in ('admin','pastor','media')
 ) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if requested_scene not between 1 and 5 or length(requested_prompt)>3000 or length(requested_prompt)<1
    or requested_model not in ('gemini-2.5-flash-image','gemini-3.1-flash-image')
 then raise exception 'INVALID_IMAGE_REQUEST';end if;
 if s.source_version<>expected_source or s.analysis_version<>expected_analysis
 then raise exception 'STALE_SOURCE';end if;
 select * into a from public.sermon_analyses where sermon_id=target and source_version=s.source_version;
 if not found then raise exception 'ANALYSIS_REQUIRED';end if;
 select value into scene from jsonb_array_elements(a.data->'scenes') value
 where (value->>'scene_id')::int=requested_scene limit 1;
 if scene is null or scene->>'visual_description' is distinct from requested_prompt
 then raise exception 'UNREVIEWED_IMAGE_PROMPT';end if;
 if exists(select 1 from public.sermon_scene_images
  where sermon_id=target and scene_id=requested_scene and status='running') then
  raise exception 'ALREADY_RUNNING';end if;
 if (select count(*) from public.sermon_scene_images where sermon_id=target)>=15
 or (select count(*) from public.sermon_scene_images where requested_by=actor
      and created_at>=now()-interval '24 hours')>=12
 then raise exception 'IMAGE_DAILY_LIMIT';end if;
 insert into public.sermon_scene_images
 (sermon_id,church_id,scene_id,source_version,analysis_version,requested_by,prompt,model)
 values(target,s.church_id,requested_scene,expected_source,expected_analysis,actor,requested_prompt,requested_model)
 returning id into v;
 return v;
end $$;
revoke all on function public.reserve_scene_image(uuid,uuid,integer,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_scene_image(uuid,uuid,integer,integer,integer,text,text) to service_role;
commit;
