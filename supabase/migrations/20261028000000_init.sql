-- Campus Growth Tracker — initial schema
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Security model:
--   * Every table has row-level security (RLS) ON.
--   * anon (public visitors) have NO table privileges and NO policies: they cannot read anything.
--   * The only public write path is the SECURITY DEFINER function public.register_student().
--   * Admins are rows in public.admin_users; only they can read registrations / manage ambassadors.
--   * Demo data does NOT exist in the database. It is generated in application code only.

-- ───────────────────────── email normalisation ─────────────────────────
-- Mirrors the original prototype: trim + lowercase, drop "+tag" in the local part,
-- remove dots for gmail.com / googlemail.com (and map googlemail → gmail).
create or replace function public.normalize_email(raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(regexp_replace(coalesce(raw, ''), '^\s+|\s+$', '', 'g'));
  rev_pos int;
  at_pos int;
  local_part text;
  domain_part text;
begin
  rev_pos := strpos(reverse(v), '@');
  if rev_pos = 0 then return v; end if;
  at_pos := length(v) - rev_pos + 1;
  if at_pos < 2 then return v; end if;
  local_part  := split_part(substr(v, 1, at_pos - 1), '+', 1);
  domain_part := substr(v, at_pos + 1);
  if domain_part in ('gmail.com', 'googlemail.com') then
    local_part  := replace(local_part, '.', '');
    domain_part := 'gmail.com';
  end if;
  return local_part || '@' || domain_part;
end
$$;

-- ───────────────────────── tables ─────────────────────────
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.ambassadors (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9-]{4,20}$'),
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.registrations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 2 and 80),
  email            text not null check (char_length(email) between 5 and 254
                                        and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  -- The unique identifier for a student. Enforced by the database, not by application code.
  email_normalized text generated always as (public.normalize_email(email)) stored not null,
  college          text not null check (char_length(btrim(college)) between 3 and 120),
  grad_year        smallint not null check (grad_year in (2026, 2027)),
  source           text not null check (source in
                     ('ambassador','whatsapp','instagram','linkedin','college','friend','other')),
  ref_code         text references public.ambassadors (code) on update cascade,
  consent_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  -- Campaign day in India Standard Time, used for the daily trend.
  reg_day          date generated always as ((created_at at time zone 'Asia/Kolkata')::date) stored,
  constraint registrations_email_normalized_key unique (email_normalized),
  -- source = ambassador  <=>  a referral code is present
  constraint registrations_source_ref_consistent check ((source = 'ambassador') = (ref_code is not null))
);
create index registrations_created_at_idx on public.registrations (created_at);
create index registrations_ref_code_idx   on public.registrations (ref_code);

create table public.campaign_settings (
  id         boolean primary key default true check (id),   -- single-row table
  start_date date,                                          -- day 1 of the 7-day campaign (IST)
  updated_at timestamptz not null default now()
);
insert into public.campaign_settings (id) values (true) on conflict do nothing;

-- Abuse throttling (per hashed client key). Never exposes IPs: the app sends an HMAC.
create table public.registration_attempts (
  id           bigint generated always as identity primary key,
  client_key   text not null,
  attempted_at timestamptz not null default now()
);
create index registration_attempts_key_idx on public.registration_attempts (client_key, attempted_at desc);

-- ───────────────────────── admin check ─────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ───────────────────────── RLS + privileges ─────────────────────────
alter table public.admin_users           enable row level security;
alter table public.ambassadors           enable row level security;
alter table public.registrations         enable row level security;
alter table public.campaign_settings     enable row level security;
alter table public.registration_attempts enable row level security;

revoke all on public.admin_users, public.ambassadors, public.registrations,
              public.campaign_settings, public.registration_attempts
  from anon, authenticated;

grant select         on public.registrations     to authenticated;
grant select, insert, update on public.ambassadors       to authenticated;
grant select, insert, update on public.campaign_settings to authenticated;

create policy registrations_admin_read   on public.registrations     for select to authenticated using (public.is_admin());
create policy ambassadors_admin_read     on public.ambassadors       for select to authenticated using (public.is_admin());
create policy ambassadors_admin_insert   on public.ambassadors       for insert to authenticated with check (public.is_admin());
create policy ambassadors_admin_update   on public.ambassadors       for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_admin_read        on public.campaign_settings for select to authenticated using (public.is_admin());
create policy settings_admin_update      on public.campaign_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- admin_users and registration_attempts: RLS on, no policies => nobody but the table owner / definer functions.

-- ───────────────────────── the one public write path ─────────────────────────
create or replace function public.register_student(
  p_name text, p_email text, p_college text, p_grad_year int,
  p_source text, p_ref_code text, p_consent boolean, p_client_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := btrim(coalesce(p_name, ''));
  v_email   text := btrim(coalesce(p_email, ''));
  v_college text := btrim(coalesce(p_college, ''));
  v_source  text := lower(btrim(coalesce(p_source, '')));
  v_code    text := nullif(upper(btrim(coalesce(p_ref_code, ''))), '');
  v_recent  int;
  c_limit constant int := 60;   -- max submissions per client key per hour (campus Wi-Fi shares one IP)
begin
  if coalesce(p_consent, false) is not true then
    return jsonb_build_object('status', 'consent_required');
  end if;

  if p_client_key is not null and length(p_client_key) between 8 and 128 then
    select count(*) into v_recent from public.registration_attempts
     where client_key = p_client_key and attempted_at > now() - interval '1 hour';
    if v_recent >= c_limit then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    insert into public.registration_attempts (client_key) values (p_client_key);
    if random() < 0.02 then
      delete from public.registration_attempts where attempted_at < now() - interval '1 day';
    end if;
  end if;

  if v_code is not null then
    perform 1 from public.ambassadors where code = v_code and active;
    if not found then
      return jsonb_build_object('status', 'bad_ref');
    end if;
    v_source := 'ambassador';
  end if;

  begin
    insert into public.registrations (name, email, college, grad_year, source, ref_code)
    values (v_name, v_email, v_college, p_grad_year, v_source, v_code);
  exception
    when unique_violation then
      return jsonb_build_object('status', 'duplicate');   -- safe under simultaneous submissions
    when check_violation or numeric_value_out_of_range then
      return jsonb_build_object('status', 'invalid');
  end;

  return jsonb_build_object('status', 'ok');
end
$$;
revoke all on function public.register_student(text, text, text, int, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.register_student(text, text, text, int, text, text, boolean, text) to anon, authenticated;
