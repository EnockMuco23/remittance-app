--
-- PostgreSQL database dump
--

\restrict lXcgJelm42Wu7Num05aKbyFAKhivqpJwuKpTMUoTdVmkZSVLQ4jMeb4f0lYoVzX

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: add_paybot_cash_receipt(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_paybot_cash_receipt(p_session_id uuid, p_amount numeric, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid;
  v_session_paybot_id uuid;
  v_receipt_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_amount <= 0 then
    raise exception 'Cash received must be greater than zero';
  end if;

  select s.paybot_id
    into v_session_paybot_id
  from public.paybot_cash_sessions s
  where s.id = p_session_id
    and s.closing_cash is null;

  if v_session_paybot_id is null then
    raise exception 'Cash session not found or already closed';
  end if;

  if v_session_paybot_id <> v_user_id then
    raise exception 'Cash session does not belong to the authenticated Paybot' using errcode = '42501';
  end if;

  insert into public.paybot_cash_receipts (
    session_id,
    paybot_id,
    amount,
    notes
  )
  values (
    p_session_id,
    v_session_paybot_id,
    p_amount,
    nullif(trim(p_notes), '')
  )
  returning id into v_receipt_id;

  return v_receipt_id;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: paybot_cash_correction_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paybot_cash_correction_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    paybot_id uuid NOT NULL,
    old_closing_cash numeric NOT NULL,
    requested_closing_cash numeric NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    decision_note text,
    expires_at timestamp with time zone,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paybot_cash_correction_requests_old_closing_cash_check CHECK ((old_closing_cash >= (0)::numeric)),
    CONSTRAINT paybot_cash_correction_requests_reason_check CHECK (((length(btrim(reason)) >= 3) AND (length(btrim(reason)) <= 1000))),
    CONSTRAINT paybot_cash_correction_requests_requested_closing_cash_check CHECK ((requested_closing_cash >= (0)::numeric)),
    CONSTRAINT paybot_cash_correction_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'used'::text, 'expired'::text])))
);


--
-- Name: apply_paybot_cash_correction(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_paybot_cash_correction(p_request_id uuid) RETURNS public.paybot_cash_correction_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_request public.paybot_cash_correction_requests;
  v_session public.paybot_cash_sessions%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_actor_id;

  if v_role <> 'paybot' then
    raise exception 'Only paybots can apply an approved cash correction.' using errcode = '42501';
  end if;

  select * into v_request
  from public.paybot_cash_correction_requests r
  where r.id = p_request_id
    and r.paybot_id = v_actor_id
  for update;

  if not found then
    raise exception 'Correction request not found or not owned by you.';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'This correction is not approved for use.';
  end if;

  if v_request.expires_at is not null and v_request.expires_at <= now() then
    update public.paybot_cash_correction_requests
    set status = 'expired'
    where id = v_request.id;
    raise exception 'This correction approval has expired.';
  end if;

  select * into v_session
  from public.paybot_cash_sessions s
  where s.id = v_request.session_id
    and s.paybot_id = v_actor_id
  for update;

  if not found then
    raise exception 'Cash session not found or not owned by you.';
  end if;

  if v_session.closed_at is null or v_session.closing_cash is null then
    raise exception 'Cash session is not closed.';
  end if;

  if v_session.closing_cash <> v_request.old_closing_cash then
    raise exception 'The cash session no longer has the original value approved for correction.';
  end if;

  update public.paybot_cash_sessions
  set closing_cash = v_request.requested_closing_cash
  where id = v_session.id;

  update public.paybot_cash_correction_requests
  set status = 'used',
      used_at = now()
  where id = v_request.id
  returning * into v_request;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  ) values (
    null,
    v_actor_id,
    'paybot_cash_correction_applied',
    'Cash session ' || v_session.id::text || ': ' ||
    v_request.old_closing_cash::text || ' -> ' ||
    v_request.requested_closing_cash::text ||
    '. Approved by Management user ' || coalesce(v_request.approved_by::text, 'unknown') || '.'
  );

  return v_request;
end;
$$;


--
-- Name: approve_paybot_registration(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_paybot_registration(p_registration_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_user_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_actor_id
      and role = 'management'
  ) then
    raise exception 'Only management can approve Paybot registrations.'
      using errcode = '42501';
  end if;

  select user_id
  into v_user_id
  from public.paybot_registrations
  where id = p_registration_id
    and status = 'pending';

  if v_user_id is null then
    raise exception 'Registration not found or is no longer pending.';
  end if;

  update public.paybot_registrations
  set
    status = 'approved',
    reviewed_by = v_actor_id,
    reviewed_at = now(),
    rejection_reason = null
  where id = p_registration_id;

  update public.profiles
  set role = 'paybot'
  where id = v_user_id;

  insert into public.paybot_country_assignments (
    paybot_id,
    destination_country
  )
  select
    v_user_id,
    country
  from unnest(
    (
      select requested_countries
      from public.paybot_registrations
      where id = p_registration_id
    )
  ) as country;
end;
$$;


--
-- Name: approve_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_transfer(transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid;
  v_transfer public.transfer_requests;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'You must be logged in';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and profile.role = 'agent'
  ) then
    raise exception 'Access denied';
  end if;

  select transfer.*
  into v_transfer
  from public.transfer_requests as transfer
  where transfer.id = transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_transfer.agent_id <> v_user_id then
    raise exception 'You are not the assigned agent for this transfer';
  end if;

  if v_transfer.status <> 'requested' then
    raise exception
      'Only requested transfers can be approved';
  end if;

  update public.transfer_requests
  set status = 'agent_approved'
  where id = transfer_id;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    transfer_id,
    v_user_id,
    'agent_approved',
    'Agent approved the transfer.'
  );
end;
$$;


--
-- Name: archive_completed_transfers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_completed_transfers() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_run_id uuid;
  v_batch_count integer;
  v_archived_count bigint := 0;
begin
  insert into public.transfer_archive_runs (status)
  values ('running')
  returning id into v_run_id;

  create temporary table tmp_transfer_archive_batch (
    id uuid primary key,
    stat_date date not null,
    agent_id uuid,
    agent_name_snapshot text,
    paybot_id uuid,
    paybot_name_snapshot text,
    currency text not null,
    destination_currency text,
    destination_country text not null,
    source_amount numeric not null,
    destination_amount numeric
  ) on commit drop;

  loop
    truncate tmp_transfer_archive_batch;

    insert into tmp_transfer_archive_batch (
      id, stat_date, agent_id, agent_name_snapshot,
      paybot_id, paybot_name_snapshot, currency,
      destination_currency, destination_country,
      source_amount, destination_amount
    )
    select
      t.id,
      t.completed_at::date,
      t.agent_id,
      agent.full_name,
      t.paybot_id,
      paybot.full_name,
      t.currency,
      t.destination_currency,
      t.destination_country,
      coalesce(t.source_amount, t.amount),
      coalesce(t.destination_amount, 0)
    from public.transfer_requests t
    left join public.profiles agent on agent.id = t.agent_id
    left join public.profiles paybot on paybot.id = t.paybot_id
    where t.status = 'completed'
      and t.completed_at < now() - interval '14 days'
      and t.pending_reason is null
      and not exists (
        select 1
        from public.compliance_alerts a
        where a.transfer_id = t.id
      )
    order by t.completed_at
    for update of t skip locked
    limit 500;

    get diagnostics v_batch_count = row_count;
    exit when v_batch_count = 0;

    insert into public.transfer_archive_daily_stats (
      stat_date,
      agent_id,
      agent_name_snapshot,
      paybot_id,
      paybot_name_snapshot,
      currency,
      destination_currency,
      destination_country,
      completed_count,
      source_amount_total,
      destination_amount_total,
      updated_at
    )
    select
      b.stat_date,
      b.agent_id,
      b.agent_name_snapshot,
      b.paybot_id,
      b.paybot_name_snapshot,
      b.currency,
      b.destination_currency,
      b.destination_country,
      count(*)::bigint,
      coalesce(sum(b.source_amount),0),
      coalesce(sum(b.destination_amount),0),
      now()
    from tmp_transfer_archive_batch b
    group by
      b.stat_date, b.agent_id, b.agent_name_snapshot,
      b.paybot_id, b.paybot_name_snapshot, b.currency,
      b.destination_currency, b.destination_country
    on conflict (
      stat_date, agent_id, paybot_id, currency,
      destination_currency, destination_country
    )
    do update set
      agent_name_snapshot =
        coalesce(excluded.agent_name_snapshot,
                 public.transfer_archive_daily_stats.agent_name_snapshot),
      paybot_name_snapshot =
        coalesce(excluded.paybot_name_snapshot,
                 public.transfer_archive_daily_stats.paybot_name_snapshot),
      completed_count =
        public.transfer_archive_daily_stats.completed_count + excluded.completed_count,
      source_amount_total =
        public.transfer_archive_daily_stats.source_amount_total + excluded.source_amount_total,
      destination_amount_total =
        public.transfer_archive_daily_stats.destination_amount_total + excluded.destination_amount_total,
      updated_at = now();

    delete from public.transfer_requests t
    using tmp_transfer_archive_batch b
    where t.id = b.id;

    v_archived_count := v_archived_count + v_batch_count;
  end loop;

  update public.transfer_archive_runs
  set completed_at = now(), archived_count = v_archived_count, status = 'completed'
  where id = v_run_id;

  return v_archived_count;
exception
  when others then
    if v_run_id is not null then
      update public.transfer_archive_runs
      set completed_at = now(), archived_count = v_archived_count,
          status = 'failed', error_message = sqlerrm
      where id = v_run_id;
    end if;
    raise;
end;
$$;


--
-- Name: cancel_overdue_paybot_transfer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_overdue_paybot_transfer(p_transfer_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_transfer public.transfer_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_actor_id and role = 'compliance_manager'
  ) then
    raise exception 'Only the Compliance Manager can cancel overdue payment-pending transfers.' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'A cancellation reason is required.' using errcode = '22023';
  end if;

  select *
    into v_transfer
  from public.transfer_requests
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found.' using errcode = 'P0001';
  end if;

  if v_transfer.status <> 'paybot_pending' then
    raise exception 'Only payment-pending transfers can be cancelled by this workflow.' using errcode = 'P0001';
  end if;

  if v_transfer.pending_since is null
     or v_transfer.pending_since > now() - interval '48 hours' then
    raise exception 'A payment-pending transfer can only be cancelled after more than 48 hours pending.' using errcode = 'P0001';
  end if;

  update public.transfer_requests
  set status = 'cancelled',
      pending_reason_code = null,
      pending_reason_details = null,
      pending_since = null
  where id = p_transfer_id;

  insert into public.transaction_events (
    transaction_id, actor_id, event_type, notes
  ) values (
    p_transfer_id,
    v_actor_id,
    'cancelled',
    'Compliance Manager cancelled an overdue payment-pending transfer. Reason: ' || v_reason
  );
end;
$$;


--
-- Name: close_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_business_day() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_day_id uuid;
  v_business_date date;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select profile.role
    into v_role
  from public.profiles as profile
  where profile.id = v_actor_id;

  if v_role <> 'management' then
    raise exception 'Only Management can begin closing the business day.' using errcode = '42501';
  end if;

  select day.id, day.business_date
    into v_day_id, v_business_date
  from public.business_days as day
  where day.status = 'open'
  order by day.opened_at desc
  limit 1
  for update;

  if v_day_id is null then
    raise exception 'There is no open business day to begin closing.';
  end if;

  update public.business_days
  set status = 'closing'
  where id = v_day_id;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    null,
    v_actor_id,
    'business_day_closing',
    'Business day entered closing: ' || v_business_date::text
  );
end;
$$;


--
-- Name: close_paybot_cash_session(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_paybot_cash_session(p_session_id uuid, p_closing_cash numeric) RETURNS TABLE(expected_cash numeric, actual_cash numeric, discrepancy numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_session public.paybot_cash_sessions%rowtype;
  v_new_float numeric := 0;
  v_payouts numeric := 0;
  v_expected_cash numeric := 0;
  v_role text;
begin
  select p.role
  into v_role
  from public.profiles p
  where p.id = (select auth.uid());

  if v_role <> 'paybot' then
    raise exception 'Only paybots can close cash sessions';
  end if;

  select *
  into v_session
  from public.paybot_cash_sessions
  where id = p_session_id
    and paybot_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Cash session not found or not owned by you';
  end if;

  if v_session.closed_at is not null then
    raise exception 'Cash session is already closed';
  end if;

  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'Closing cash cannot be negative';
  end if;

  select coalesce(sum(r.amount), 0)
  into v_new_float
  from public.paybot_cash_receipts r
  where r.session_id = v_session.id;

  select coalesce(sum(t.destination_amount), 0)
  into v_payouts
  from public.transfer_requests t
  where t.paybot_id = v_session.paybot_id
    and t.destination_currency = v_session.currency
    and t.status = 'completed'
    and t.completed_at >= v_session.cash_date::timestamptz
    and t.completed_at < (v_session.cash_date + 1)::timestamptz;

  v_expected_cash := v_session.opening_cash + v_new_float - v_payouts;

  update public.paybot_cash_sessions
  set closing_cash = p_closing_cash,
      closed_at = now()
  where id = v_session.id;

  return query
  select
    v_expected_cash,
    p_closing_cash,
    p_closing_cash - v_expected_cash;
end;
$$;


--
-- Name: complete_paybot_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_paybot_transfer(p_transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_actor_id and role = 'paybot'
  ) then
    raise exception 'Only Paybots can complete transfers.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.transfer_requests
    where id = p_transfer_id
      and paybot_id = v_actor_id
      and status = 'paybot_accepted'
    for update
  ) then
    raise exception 'Transfer must be in Paybot accepted status before completion. Resume a pending transfer first.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.attachments
    where transaction_id = p_transfer_id
      and uploaded_by = v_actor_id
      and evidence_type = 'paybot_payout'
  ) then
    raise exception 'Payout proof must be uploaded before completing the transfer. The screenshot should clearly show the recipient name and paid amount.' using errcode = 'P0001';
  end if;

  update public.transfer_requests
  set status = 'completed',
      completed_at = now()
  where id = p_transfer_id
    and paybot_id = v_actor_id
    and status = 'paybot_accepted';

  if not found then
    raise exception 'Transfer could not be completed because its status changed. Please refresh and try again.' using errcode = 'P0001';
  end if;

  insert into public.transaction_events (
    transaction_id, actor_id, event_type, notes
  ) values (
    p_transfer_id,
    v_actor_id,
    'completed',
    'Transfer completed after payout evidence was uploaded. Payout evidence must show recipient name and paid amount.'
  );
end;
$$;


--
-- Name: confirm_agent_payment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_agent_payment(transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_status text;
  assigned_agent uuid;
begin
  select status, agent_id
  into current_status, assigned_agent
  from public.transfer_requests
  where id = transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  if assigned_agent is null or assigned_agent <> auth.uid() then
    raise exception 'You are not the assigned agent for this transfer';
  end if;

  if current_status <> 'agent_approved' then
    raise exception 'Payment cannot be confirmed from the current status';
  end if;

  update public.transfer_requests
  set status = 'payment_confirmed'
  where id = transfer_id;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    transfer_id,
    auth.uid(),
    'payment_confirmed',
    'Agent confirmed that the payment was sent'
  );
end;
$$;


--
-- Name: confirm_client_payment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_client_payment(p_transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid;
  v_transfer public.transfer_requests;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'You must be logged in';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and profile.role = 'agent'
  ) then
    raise exception 'Access denied';
  end if;

  select transfer.*
  into v_transfer
  from public.transfer_requests as transfer
  where transfer.id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_transfer.agent_id <> v_user_id then
    raise exception 'You are not the assigned agent for this transfer';
  end if;

  if v_transfer.status <> 'agent_approved' then
    raise exception
      'Only agent-approved transfers can have payment confirmed';
  end if;

  update public.transfer_requests
  set status = 'payment_confirmed'
  where id = p_transfer_id;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    p_transfer_id,
    v_user_id,
    'payment_confirmed',
    'Agent confirmed that the client payment was received.'
  );
end;
$$;


--
-- Name: create_compliance_notice(text, text, text, text, timestamp with time zone, timestamp with time zone, text, text, text[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_compliance_notice(p_notice_type text, p_title text, p_description text DEFAULT NULL::text, p_priority text DEFAULT 'normal'::text, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_location text DEFAULT NULL::text, p_meeting_link text DEFAULT NULL::text, p_recipient_roles text[] DEFAULT '{}'::text[], p_recipient_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_notice_id uuid;
begin
  perform public.require_compliance_manager_role();

  if p_notice_type not in ('meeting','announcement','reminder','compliance_request') then
    raise exception 'Invalid notice type';
  end if;

  if p_priority not in ('normal','important','urgent') then
    raise exception 'Invalid priority';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'Title is required';
  end if;

  if p_ends_at is not null and p_starts_at is not null and p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  if p_notice_type = 'meeting' and p_meeting_link is not null and length(trim(p_meeting_link)) > 0
     and p_meeting_link !~* '^https?://' then
    raise exception 'Meeting link must be a valid HTTP or HTTPS URL';
  end if;

  insert into public.compliance_notices (
    created_by, notice_type, title, description, priority,
    starts_at, ends_at, location, meeting_link
  ) values (
    auth.uid(), p_notice_type, trim(p_title), p_description, p_priority,
    p_starts_at, p_ends_at, nullif(trim(p_location), ''), nullif(trim(p_meeting_link), '')
  )
  returning id into v_notice_id;

  insert into public.compliance_notice_recipients (notice_id, recipient_id)
  select v_notice_id, p.id
  from public.profiles p
  where p.id = any(coalesce(p_recipient_ids, '{}'::uuid[]))
     or p.role = any(coalesce(p_recipient_roles, '{}'::text[]))
  on conflict (notice_id, recipient_id) do nothing;

  if not exists (
    select 1 from public.compliance_notice_recipients r where r.notice_id = v_notice_id
  ) then
    delete from public.compliance_notices where id = v_notice_id;
    raise exception 'At least one recipient is required';
  end if;

  return v_notice_id;
end;
$$;


--
-- Name: create_transfer_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_transfer_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    new.id,
    new.client_id,
    'transfer_requested',
    'Client submitted the transfer request'
  );

  return new;
end;
$$;


--
-- Name: decide_paybot_cash_correction(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decide_paybot_cash_correction(p_request_id uuid, p_approve boolean, p_decision_note text DEFAULT NULL::text) RETURNS public.paybot_cash_correction_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_request public.paybot_cash_correction_requests;
  v_new_status text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_actor_id;

  if v_role <> 'management' then
    raise exception 'Only Management can approve or reject cash corrections.' using errcode = '42501';
  end if;

  if p_decision_note is not null and length(btrim(p_decision_note)) > 1000 then
    raise exception 'Decision note is too long.';
  end if;

  select * into v_request
  from public.paybot_cash_correction_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Correction request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending correction requests can be decided.';
  end if;

  v_new_status := case when p_approve then 'approved' else 'rejected' end;

  update public.paybot_cash_correction_requests
  set status = v_new_status,
      approved_by = v_actor_id,
      approved_at = now(),
      decision_note = nullif(btrim(p_decision_note), ''),
      expires_at = case when p_approve then now() + interval '24 hours' else null end
  where id = v_request.id
  returning * into v_request;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  ) values (
    null,
    v_actor_id,
    case when p_approve then 'paybot_cash_correction_approved' else 'paybot_cash_correction_rejected' end,
    'Cash correction request ' || v_request.id::text ||
    ' for session ' || v_request.session_id::text ||
    '. ' || coalesce(nullif(btrim(p_decision_note), ''), 'No decision note provided.')
  );

  return v_request;
end;
$$;


--
-- Name: enforce_cash_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_cash_business_day() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_business_date date;
  v_status text;
begin
  select day.business_date, day.status
    into v_business_date, v_status
  from public.business_days as day
  where day.status in ('open', 'closing')
  order by day.opened_at desc
  limit 1;

  if v_business_date is null then
    raise exception 'There is no active business day. Cash operation is not allowed.' using errcode = 'P0001';
  end if;

  if new.cash_date <> v_business_date then
    raise exception 'Cash session must belong to the current business day (%).', v_business_date using errcode = 'P0001';
  end if;

  return new;
end;
$$;


--
-- Name: enforce_daily_rate_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_daily_rate_business_day() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_business_date date;
begin
  select business_date
  into v_business_date
  from public.business_days
  where status = 'open'
  order by opened_at desc
  limit 1;

  if v_business_date is null then
    raise exception 'The business day is closed. Daily rates cannot be entered.' using errcode = 'P0001';
  end if;

  if new.rate_date <> v_business_date then
    raise exception 'Daily rate date must match the current business day (%).', v_business_date using errcode = 'P0001';
  end if;

  return new;
end;
$$;


--
-- Name: enforce_paybot_cash_receipt_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_paybot_cash_receipt_business_day() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_business_date date;
  v_session_date date;
  v_session_paybot_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select business_date
    into v_business_date
  from public.business_days
  where status in ('open', 'closing')
  order by opened_at desc
  limit 1;

  if v_business_date is null then
    raise exception 'There is no active business day. Cash receipts cannot be recorded.' using errcode = 'P0001';
  end if;

  select s.cash_date, s.paybot_id
    into v_session_date, v_session_paybot_id
  from public.paybot_cash_sessions s
  where s.id = new.session_id;

  if v_session_date is null or v_session_date <> v_business_date then
    raise exception 'Cash receipt must belong to the current business day.' using errcode = 'P0001';
  end if;

  if v_session_paybot_id is null then
    raise exception 'Cash session has no Paybot assigned.' using errcode = 'P0001';
  end if;

  if v_session_paybot_id <> v_user_id then
    raise exception 'Cash session does not belong to the authenticated Paybot' using errcode = '42501';
  end if;

  -- The session is the authoritative source of the Paybot identity.
  -- This also protects against any client/RPC path that supplies NULL.
  new.paybot_id := v_session_paybot_id;

  return new;
end;
$$;


--
-- Name: enforce_transfer_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_transfer_business_day() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_day public.business_days;
begin
  select *
    into v_day
  from public.business_days
  where status in ('open', 'closing')
  order by opened_at desc
  limit 1
  for update;

  if v_day.id is null then
    raise exception 'There is no active business day. New or updated transfers are not allowed.' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if v_day.status <> 'open' then
      raise exception 'The business day is closing. New transfers are no longer accepted.' using errcode = 'P0001';
    end if;

    new.business_day_id := v_day.id;
    return new;
  end if;

  if new.business_day_id is distinct from old.business_day_id then
    raise exception 'A transfer cannot be moved between business days.' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status and old.business_day_id is distinct from v_day.id then
    raise exception 'This transfer belongs to a different business day.' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status and old.status in ('completed','rejected','cancelled') then
    raise exception 'A finalized transfer cannot be changed.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;


--
-- Name: evaluate_compliance_transfer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evaluate_compliance_transfer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  threshold numeric;
  duplicate_id uuid;
begin
  select ct.high_value_amount
    into threshold
  from public.compliance_thresholds ct
  where ct.currency = new.currency
    and ct.enabled = true
    and ct.effective_from <= coalesce(new.created_at, now())
    and (ct.effective_until is null or ct.effective_until > coalesce(new.created_at, now()))
  order by ct.effective_from desc
  limit 1;

  if threshold is not null and new.amount >= threshold then
    insert into public.compliance_alerts(transfer_id, alert_type, severity, reason, metadata)
    values (
      new.id,
      'high_value',
      case when new.amount >= threshold * 2 then 'high' else 'medium' end,
      'Transfer amount meets or exceeds the configured high-value threshold.',
      jsonb_build_object('amount',new.amount,'currency',new.currency,'threshold',threshold)
    ) on conflict (transfer_id, alert_type) where transfer_id is not null do nothing;
  end if;

  select t.id into duplicate_id
  from public.transfer_requests t
  where t.id <> new.id
    and t.amount = new.amount
    and t.currency = new.currency
    and t.destination_country = new.destination_country
    and coalesce(t.recipient_name,'') = coalesce(new.recipient_name,'')
    and coalesce(t.recipient_phone,'') = coalesce(new.recipient_phone,'')
    and t.created_at >= coalesce(new.created_at, now()) - interval '24 hours'
    and t.created_at <= coalesce(new.created_at, now()) + interval '1 minute'
  order by t.created_at desc
  limit 1;

  if duplicate_id is not null then
    insert into public.compliance_alerts(transfer_id, alert_type, severity, reason, metadata)
    values (
      new.id,
      'possible_duplicate',
      'low',
      'Transfer matches another recent transfer on amount, currency, destination country, recipient name and recipient phone. Review for accidental duplication.',
      jsonb_build_object('matching_transfer_id',duplicate_id)
    ) on conflict (transfer_id, alert_type) where transfer_id is not null do nothing;
  end if;

  return new;
end;
$$;


--
-- Name: finalize_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_business_day() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_day_id uuid;
  v_business_date date;
  v_open_sessions integer;
  v_active_transfers integer;
  v_pending_corrections integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select profile.role into v_role
  from public.profiles as profile
  where profile.id = v_actor_id;

  if v_role <> 'management' then
    raise exception 'Only Management can finalize the business day.' using errcode = '42501';
  end if;

  select day.id, day.business_date into v_day_id, v_business_date
  from public.business_days as day
  where day.status = 'closing'
  order by day.opened_at desc
  limit 1
  for update;

  if v_day_id is null then
    raise exception 'There is no business day in closing.';
  end if;

  select count(*)::integer into v_open_sessions
  from public.paybot_cash_sessions as session
  where session.cash_date = v_business_date
    and session.closed_at is null;

  if v_open_sessions > 0 then
    raise exception 'Cannot finalize the business day while % Paybot cash session(s) remain open.', v_open_sessions;
  end if;

  select count(*)::integer into v_pending_corrections
  from public.paybot_cash_correction_requests as correction
  join public.paybot_cash_sessions as session on session.id = correction.session_id
  where session.cash_date = v_business_date
    and correction.status = 'pending';

  if v_pending_corrections > 0 then
    raise exception 'Cannot finalize the business day while % cash correction request(s) remain pending.', v_pending_corrections;
  end if;

  select count(*)::integer into v_active_transfers
  from public.transfer_requests as transfer
  where transfer.business_day_id = v_day_id
    and transfer.status not in ('completed', 'rejected', 'cancelled');

  if v_active_transfers > 0 then
    raise exception 'Cannot finalize the business day while % transfer(s) remain active.', v_active_transfers;
  end if;

  update public.business_days
  set status = 'closed', closed_at = now(), closed_by = v_actor_id
  where id = v_day_id;

  insert into public.transaction_events (transaction_id, actor_id, event_type, notes)
  values (null, v_actor_id, 'business_day_closed', 'Business day finalized: ' || v_business_date::text);
end;
$$;


--
-- Name: get_auditor_paybot_cash_session(uuid, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auditor_paybot_cash_session(p_paybot_id uuid, p_cash_date date, p_currency text) RETURNS TABLE(id uuid, paybot_id uuid, paybot_name text, cash_date date, currency text, opening_cash numeric, new_float numeric, payouts numeric, expected_closing numeric, closing_cash numeric, discrepancy numeric, closed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=(select auth.uid());
  if v_role <> 'auditor' then raise exception 'Only auditors can access auditor cash reconciliation'; end if;
  return query
  select s.id,s.paybot_id,p.full_name,s.cash_date,s.currency,s.opening_cash,
    coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0),
    coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0),
    s.opening_cash+coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0)-coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0),
    s.closing_cash,
    s.closing_cash-(s.opening_cash+coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0)-coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0)),
    s.closed_at
  from public.paybot_cash_sessions s
  join public.profiles p on p.id=s.paybot_id
  where s.paybot_id=p_paybot_id and s.cash_date=p_cash_date and s.currency=p_currency
  order by s.created_at desc limit 1;
end;
$$;


--
-- Name: get_auditor_paybot_cash_sessions(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auditor_paybot_cash_sessions(p_paybot_id uuid, p_cash_date date) RETURNS TABLE(id uuid, paybot_id uuid, paybot_name text, cash_date date, currency text, opening_cash numeric, new_float numeric, payouts numeric, expected_closing numeric, closing_cash numeric, discrepancy numeric, closed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=(select auth.uid());
  if v_role <> 'auditor' then raise exception 'Only auditors can access paybot cash sessions'; end if;

  return query
  select s.id,s.paybot_id,p.full_name,s.cash_date,s.currency,s.opening_cash,
    coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0),
    coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0),
    s.opening_cash+coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0)-coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0),
    s.closing_cash,
    s.closing_cash-(s.opening_cash+coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0)-coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0)),
    s.closed_at
  from public.paybot_cash_sessions s
  join public.profiles p on p.id=s.paybot_id
  where s.paybot_id=p_paybot_id and s.cash_date=p_cash_date
  order by s.currency;
end;
$$;


--
-- Name: get_auditor_paybot_discrepancy_history(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auditor_paybot_discrepancy_history(p_paybot_id uuid, p_limit integer DEFAULT 10) RETURNS TABLE(session_id uuid, cash_date date, currency text, opening_cash numeric, total_new_float numeric, total_payouts numeric, expected_closing_cash numeric, actual_closing_cash numeric, discrepancy numeric, closed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'auditor'
  ) THEN
    RAISE EXCEPTION 'Auditor access required';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS session_id,
    s.cash_date,
    s.currency,
    s.opening_cash,
    COALESCE(r.total_new_float, 0) AS total_new_float,
    COALESCE(t.total_payouts, 0) AS total_payouts,
    s.opening_cash
      + COALESCE(r.total_new_float, 0)
      - COALESCE(t.total_payouts, 0) AS expected_closing_cash,
    s.closing_cash AS actual_closing_cash,
    s.closing_cash - (
      s.opening_cash
      + COALESCE(r.total_new_float, 0)
      - COALESCE(t.total_payouts, 0)
    ) AS discrepancy,
    s.closed_at
  FROM public.paybot_cash_sessions s
  LEFT JOIN (
    SELECT session_id, SUM(amount) AS total_new_float
    FROM public.paybot_cash_receipts
    GROUP BY session_id
  ) r ON r.session_id = s.id
  LEFT JOIN (
    SELECT
      session_id,
      SUM(amount) AS total_payouts
    FROM public.transfers
    WHERE status = 'completed'
      AND session_id IS NOT NULL
    GROUP BY session_id
  ) t ON t.session_id = s.id
  WHERE s.paybot_id = p_paybot_id
    AND s.closed_at IS NOT NULL
    AND s.closing_cash IS NOT NULL
    AND s.closing_cash <> (
      s.opening_cash
      + COALESCE(r.total_new_float, 0)
      - COALESCE(t.total_payouts, 0)
    )
  ORDER BY s.cash_date DESC, s.closed_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 10), 1);
END;
$$;


--
-- Name: get_auditor_paybot_overview(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auditor_paybot_overview(p_cash_date date) RETURNS TABLE(paybot_id uuid, paybot_name text, session_count integer, open_session_count integer, discrepancy_session_count integer, total_discrepancy numeric, reconciliation_status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=(select auth.uid());
  if v_role <> 'auditor' then raise exception 'Only auditors can access paybot reconciliation overview'; end if;

  return query
  select
    p.id,
    p.full_name,
    count(s.id)::integer,
    count(s.id) filter (where s.closed_at is null)::integer,
    count(s.id) filter (
      where s.closed_at is not null
        and s.closing_cash - (
          s.opening_cash
          + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0)
          - coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0)
        ) <> 0
    )::integer,
    coalesce(sum(
      case when s.closed_at is not null then
        s.closing_cash - (
          s.opening_cash
          + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0)
          - coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0)
        )
      else 0 end
    ),0),
    case
      when count(s.id)=0 then 'pending'
      when count(s.id) filter (where s.closed_at is null) > 0 then 'pending'
      when count(s.id) filter (
        where s.closing_cash - (
          s.opening_cash
          + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0)
          - coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0)
        ) <> 0
      ) > 0 then 'discrepancy'
      else 'reconciled'
    end
  from public.profiles p
  left join public.paybot_cash_sessions s
    on s.paybot_id=p.id and s.cash_date=p_cash_date
  where p.role='paybot'
  group by p.id,p.full_name
  order by p.full_name;
end;
$$;


--
-- Name: get_auditor_paybot_transaction_events(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auditor_paybot_transaction_events(p_paybot_id uuid, p_cash_date date) RETURNS TABLE(id uuid, transaction_id uuid, actor_id uuid, actor_name text, event_type text, notes text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=(select auth.uid());
  if v_role <> 'auditor' then raise exception 'Only auditors can access transaction events'; end if;

  return query
  select e.id,e.transaction_id,e.actor_id,p.full_name,e.event_type,e.notes,e.created_at
  from public.transaction_events e
  left join public.profiles p on p.id=e.actor_id
  join public.transfer_requests t on t.id=e.transaction_id
  where t.paybot_id=p_paybot_id
    and e.created_at >= p_cash_date::timestamptz
    and e.created_at < (p_cash_date+1)::timestamptz
  order by e.created_at desc;
end;
$$;


--
-- Name: get_auditor_paybot_transfers(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auditor_paybot_transfers(p_paybot_id uuid, p_cash_date date) RETURNS TABLE(id uuid, recipient_name text, recipient_phone text, destination_country text, source_amount numeric, currency text, destination_amount numeric, destination_currency text, status text, created_at timestamp with time zone, completed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id=(select auth.uid());
  if v_role <> 'auditor' then raise exception 'Only auditors can access paybot transfer activity'; end if;

  return query
  select t.id,t.recipient_name,t.recipient_phone,t.destination_country,
    t.source_amount,t.currency,t.destination_amount,t.destination_currency,
    t.status,t.created_at,t.completed_at
  from public.transfer_requests t
  where t.paybot_id=p_paybot_id
    and t.created_at >= p_cash_date::timestamptz
    and t.created_at < (p_cash_date+1)::timestamptz
  order by t.created_at desc;
end;
$$;


--
-- Name: get_available_agents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_available_agents() RETURNS TABLE(id uuid, full_name text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    profiles.id,
    profiles.full_name
  from public.profiles
  where profiles.role = 'agent'
  order by profiles.full_name;
$$;


--
-- Name: get_compliance_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_compliance_overview() RETURNS TABLE(open_alert_count bigint, high_severity_open_count bigint, high_value_alert_count bigint, duplicate_alert_count bigint, paybot_count bigint, active_paybot_count bigint, transfer_count_today bigint, completed_transfer_count_today bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='compliance_manager') then raise exception 'Compliance Manager role required'; end if;
  return query select (select count(*) from public.compliance_alerts where status='open'),(select count(*) from public.compliance_alerts where status='open' and severity in('high','critical')),(select count(*) from public.compliance_alerts where alert_type='high_value' and status='open'),(select count(*) from public.compliance_alerts where alert_type='possible_duplicate' and status='open'),(select count(*) from public.profiles where role='paybot'),(select count(distinct t.paybot_id) from public.transfer_requests t where t.paybot_id is not null and t.created_at::date=current_date),(select count(*) from public.transfer_requests where created_at::date=current_date),(select count(*) from public.transfer_requests where created_at::date=current_date and status='completed');
end;
$$;


--
-- Name: get_current_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_business_day() RETURNS TABLE(id uuid, business_date date, status text, opened_at timestamp with time zone, opened_by uuid, closed_at timestamp with time zone, closed_by uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    day.id,
    day.business_date,
    day.status,
    day.opened_at,
    day.opened_by,
    day.closed_at,
    day.closed_by
  from public.business_days as day
  where day.status in ('open', 'closing')
  order by day.opened_at desc
  limit 1;
$$;


--
-- Name: get_daily_rate(date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_rate(p_rate_date date, p_currency_from text, p_currency_to text) RETURNS TABLE(id uuid, rate_date date, currency_from text, currency_to text, buy_rate numeric, sell_rate numeric, entered_by uuid, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    rate.id,
    rate.rate_date,
    rate.currency_from,
    rate.currency_to,
    rate.buy_rate,
    rate.sell_rate,
    rate.entered_by,
    rate.created_at
  from public.daily_rates as rate
  where rate.rate_date = p_rate_date
    and rate.currency_from = p_currency_from
    and rate.currency_to = p_currency_to;
$$;


--
-- Name: get_latest_daily_rate(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_latest_daily_rate(p_currency_from text, p_currency_to text) RETURNS TABLE(id uuid, rate_date date, currency_from text, currency_to text, buy_rate numeric, sell_rate numeric, entered_by uuid, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    rate.id,
    rate.rate_date,
    rate.currency_from,
    rate.currency_to,
    rate.buy_rate,
    rate.sell_rate,
    rate.entered_by,
    rate.created_at
  from public.daily_rates as rate
  where rate.currency_from = p_currency_from
    and rate.currency_to = p_currency_to
  order by rate.rate_date desc, rate.created_at desc
  limit 1;
$$;


--
-- Name: get_management_agents_overview(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_management_agents_overview(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(agent_id uuid, agent_name text, client_count bigint, transfer_count bigint, completed_transfer_count bigint, pending_transfer_count bigint, cancelled_transfer_count bigint, total_volume numeric, completed_volume numeric, average_delivery_seconds numeric, completion_rate numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.require_management_role();
  return query
  select p.id,p.full_name,count(distinct t.client_id),count(t.id),count(t.id) filter(where t.status='completed'),count(t.id) filter(where t.status not in('completed','cancelled')),count(t.id) filter(where t.status='cancelled'),coalesce(sum(t.amount),0),coalesce(sum(t.amount) filter(where t.status='completed'),0),avg(extract(epoch from(t.completed_at-t.created_at))) filter(where t.status='completed' and t.completed_at is not null),case when count(t.id)=0 then 0 else round((count(t.id) filter(where t.status='completed'))::numeric/count(t.id)*100,2) end
  from public.profiles p left join public.transfer_requests t on t.agent_id=p.id and(p_from is null or t.created_at>=p_from) and(p_to is null or t.created_at<p_to)
  where p.role='agent' group by p.id,p.full_name order by p.full_name;
end;
$$;


--
-- Name: get_management_cash_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_management_cash_health() RETURNS TABLE(business_date date, total_sessions integer, closed_sessions integer, open_sessions integer, discrepancy_sessions integer, total_discrepancy numeric, total_absolute_discrepancy numeric, unresolved_discrepancy_sessions integer, unresolved_discrepancy_amount numeric, health_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_actor_id;

  if v_role <> 'management' then
    raise exception 'Only Management can view company cash health.' using errcode = '42501';
  end if;

  select d.business_date
    into business_date
  from public.business_days d
  where d.status = 'closed'
  order by d.business_date desc, d.closed_at desc nulls last
  limit 1;

  if business_date is null then
    total_sessions := 0;
    closed_sessions := 0;
    open_sessions := 0;
    discrepancy_sessions := 0;
    total_discrepancy := 0;
    total_absolute_discrepancy := 0;
    unresolved_discrepancy_sessions := 0;
    unresolved_discrepancy_amount := 0;
    health_status := 'healthy';
    return next;
    return;
  end if;

  select count(*)::integer
    into total_sessions
  from public.paybot_cash_sessions s
  where s.cash_date = business_date;

  select count(*)::integer
    into closed_sessions
  from public.paybot_cash_sessions s
  where s.cash_date = business_date
    and s.closed_at is not null;

  select count(*)::integer
    into open_sessions
  from public.paybot_cash_sessions s
  where s.cash_date = business_date
    and s.closed_at is null;

  select count(*)::integer
    into discrepancy_sessions
  from public.paybot_cash_sessions s
  where s.cash_date = business_date
    and s.closed_at is not null
    and (
      s.closing_cash - (
        s.opening_cash
        + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id = s.id), 0)
        - coalesce((select sum(t.destination_amount)
                    from public.transfer_requests t
                    where t.paybot_id = s.paybot_id
                      and t.destination_currency = s.currency
                      and t.status = 'completed'
                      and t.completed_at >= s.cash_date::timestamptz
                      and t.completed_at < (s.cash_date + 1)::timestamptz), 0)
      )
    ) <> 0;

  select coalesce(sum(
      s.closing_cash - (
        s.opening_cash
        + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id = s.id), 0)
        - coalesce((select sum(t.destination_amount)
                    from public.transfer_requests t
                    where t.paybot_id = s.paybot_id
                      and t.destination_currency = s.currency
                      and t.status = 'completed'
                      and t.completed_at >= s.cash_date::timestamptz
                      and t.completed_at < (s.cash_date + 1)::timestamptz), 0)
      )
    ), 0)
    into total_discrepancy
  from public.paybot_cash_sessions s
  where s.cash_date = business_date
    and s.closed_at is not null;

  select coalesce(sum(abs(
      s.closing_cash - (
        s.opening_cash
        + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id = s.id), 0)
        - coalesce((select sum(t.destination_amount)
                    from public.transfer_requests t
                    where t.paybot_id = s.paybot_id
                      and t.destination_currency = s.currency
                      and t.status = 'completed'
                      and t.completed_at >= s.cash_date::timestamptz
                      and t.completed_at < (s.cash_date + 1)::timestamptz), 0)
      )
    )), 0)
    into total_absolute_discrepancy
  from public.paybot_cash_sessions s
  where s.cash_date = business_date
    and s.closed_at is not null;

  select count(*)::integer
    into unresolved_discrepancy_sessions
  from public.paybot_cash_sessions s
  where s.cash_date = business_date
    and s.closed_at is not null
    and (
      s.closing_cash - (
        s.opening_cash
        + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id = s.id), 0)
        - coalesce((select sum(t.destination_amount)
                    from public.transfer_requests t
                    where t.paybot_id = s.paybot_id
                      and t.destination_currency = s.currency
                      and t.status = 'completed'
                      and t.completed_at >= s.cash_date::timestamptz
                      and t.completed_at < (s.cash_date + 1)::timestamptz), 0)
      )
    ) <> 0
    and not exists (
      select 1
      from public.paybot_cash_correction_requests r
      where r.session_id = s.id
        and r.status = 'used'
    );

  select coalesce(sum(abs(
      s.closing_cash - (
        s.opening_cash
        + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id = s.id), 0)
        - coalesce((select sum(t.destination_amount)
                    from public.transfer_requests t
                    where t.paybot_id = s.paybot_id
                      and t.destination_currency = s.currency
                      and t.status = 'completed'
                      and t.completed_at >= s.cash_date::timestamptz
                      and t.completed_at < (s.cash_date + 1)::timestamptz), 0)
      )
    )), 0)
    into unresolved_discrepancy_amount
  from public.paybot_cash_sessions s
  where s.cash_date = business_date
    and s.closed_at is not null
    and (
      s.closing_cash - (
        s.opening_cash
        + coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id = s.id), 0)
        - coalesce((select sum(t.destination_amount)
                    from public.transfer_requests t
                    where t.paybot_id = s.paybot_id
                      and t.destination_currency = s.currency
                      and t.status = 'completed'
                      and t.completed_at >= s.cash_date::timestamptz
                      and t.completed_at < (s.cash_date + 1)::timestamptz), 0)
      )
    ) <> 0
    and not exists (
      select 1
      from public.paybot_cash_correction_requests r
      where r.session_id = s.id
        and r.status = 'used'
    );

  if unresolved_discrepancy_sessions > 0 then
    health_status := 'attention_required';
  elsif discrepancy_sessions > 0 then
    health_status := 'explained';
  elsif open_sessions > 0 then
    health_status := 'pending_reconciliation';
  else
    health_status := 'healthy';
  end if;

  return next;
end;
$$;


--
-- Name: get_management_paybot_cash_correction_requests(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_management_paybot_cash_correction_requests(p_status text DEFAULT NULL::text) RETURNS TABLE(id uuid, session_id uuid, paybot_id uuid, paybot_name text, cash_date date, currency text, old_closing_cash numeric, requested_closing_cash numeric, reason text, status text, requested_at timestamp with time zone, approved_by uuid, approved_at timestamp with time zone, decision_note text, expires_at timestamp with time zone, used_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_actor_id;

  if v_role <> 'management' then
    raise exception 'Only Management can view management cash correction requests.' using errcode = '42501';
  end if;

  if p_status is not null and p_status not in ('pending','approved','rejected','used','expired') then
    raise exception 'Invalid correction request status.';
  end if;

  return query
  select
    r.id,
    r.session_id,
    r.paybot_id,
    coalesce(p.full_name, 'Unknown Paybot') as paybot_name,
    s.cash_date,
    s.currency,
    r.old_closing_cash,
    r.requested_closing_cash,
    r.reason,
    r.status,
    r.requested_at,
    r.approved_by,
    r.approved_at,
    r.decision_note,
    r.expires_at,
    r.used_at,
    r.created_at
  from public.paybot_cash_correction_requests r
  join public.paybot_cash_sessions s on s.id = r.session_id
  left join public.profiles p on p.id = r.paybot_id
  where p_status is null or r.status = p_status
  order by
    case when r.status = 'pending' then 0 else 1 end,
    r.created_at desc;
end;
$$;


--
-- Name: get_management_paybots_overview(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_management_paybots_overview(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS TABLE(paybot_id uuid, paybot_name text, session_count bigint, open_session_count bigint, discrepancy_session_count bigint, new_float numeric, payout_volume numeric, completed_transfer_count bigint, average_delivery_seconds numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.require_management_role();
  return query
  with sessions as (
    select s.id,s.paybot_id,s.cash_date,s.currency,s.opening_cash,s.closing_cash,s.closed_at
    from public.paybot_cash_sessions s
    where (p_from is null or s.cash_date>=p_from) and (p_to is null or s.cash_date<=p_to)
  ),
  receipt_totals as (
    select r.session_id,coalesce(sum(r.amount),0) as new_float
    from public.paybot_cash_receipts r group by r.session_id
  ),
  payout_totals as (
    select s.id as session_id,coalesce(sum(t.amount) filter(where t.status='completed' and t.currency=s.currency and t.paybot_id=s.paybot_id and t.created_at::date=s.cash_date),0) as payout_amount
    from sessions s left join public.transfer_requests t on t.paybot_id=s.paybot_id and t.created_at::date=s.cash_date and t.currency=s.currency
    group by s.id
  ),
  ss as (
    select s.paybot_id,
      count(*) as session_count,
      count(*) filter(where s.closed_at is null) as open_session_count,
      count(*) filter(where s.closed_at is not null and s.closing_cash is not null and s.closing_cash<>s.opening_cash+coalesce(r.new_float,0)-coalesce(po.payout_amount,0)) as discrepancy_session_count,
      coalesce(sum(r.new_float),0) as new_float
    from sessions s
    left join receipt_totals r on r.session_id=s.id
    left join payout_totals po on po.session_id=s.id
    group by s.paybot_id
  ),
  ts as (
    select t.paybot_id,
      coalesce(sum(t.amount) filter(where t.status='completed'),0) as payout_volume,
      count(t.id) filter(where t.status='completed') as completed_transfer_count,
      avg(extract(epoch from(t.completed_at-t.created_at))) filter(where t.status='completed' and t.completed_at is not null) as average_delivery_seconds
    from public.transfer_requests t
    where t.paybot_id is not null and (p_from is null or t.created_at::date>=p_from) and (p_to is null or t.created_at::date<=p_to)
    group by t.paybot_id
  )
  select p.id,p.full_name,coalesce(ss.session_count,0),coalesce(ss.open_session_count,0),coalesce(ss.discrepancy_session_count,0),coalesce(ss.new_float,0),coalesce(ts.payout_volume,0),coalesce(ts.completed_transfer_count,0),ts.average_delivery_seconds
  from public.profiles p left join ss on ss.paybot_id=p.id left join ts on ts.paybot_id=p.id
  where p.role='paybot' order by p.full_name;
end;
$$;


--
-- Name: get_paybot_cash_correction_requests(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_paybot_cash_correction_requests(p_status text DEFAULT NULL::text) RETURNS SETOF public.paybot_cash_correction_requests
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_actor_id;

  if v_role not in ('paybot','management','auditor') then
    raise exception 'You are not authorized to view cash correction requests.' using errcode = '42501';
  end if;

  if p_status is not null and p_status not in ('pending','approved','rejected','used','expired') then
    raise exception 'Invalid correction request status.';
  end if;

  return query
  select r.*
  from public.paybot_cash_correction_requests r
  where (v_role in ('management','auditor') or r.paybot_id = v_actor_id)
    and (p_status is null or r.status = p_status)
  order by r.created_at desc;
end;
$$;


--
-- Name: get_paybot_cash_session(date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_paybot_cash_session(p_cash_date date, p_currency text) RETURNS TABLE(id uuid, cash_date date, currency text, opening_cash numeric, new_float numeric, payouts numeric, closing_cash numeric, closed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_role text;
begin
 select p.role into v_role from public.profiles p where p.id=(select auth.uid());
 if v_role <> 'paybot' then raise exception 'Only paybots can access this function'; end if;
 return query select s.id,s.cash_date,s.currency,s.opening_cash,
 coalesce((select sum(r.amount) from public.paybot_cash_receipts r where r.session_id=s.id),0),
 coalesce((select sum(t.destination_amount) from public.transfer_requests t where t.paybot_id=s.paybot_id and t.destination_currency=s.currency and t.status='completed' and t.completed_at>=s.cash_date::timestamptz and t.completed_at<(s.cash_date+1)::timestamptz),0),s.closing_cash,s.closed_at
 from public.paybot_cash_sessions s where s.paybot_id=(select auth.uid()) and s.cash_date=p_cash_date and s.currency=p_currency order by s.created_at desc limit 1;
end; $$;


--
-- Name: get_transfer_agent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_transfer_agent(p_transfer_id uuid) RETURNS TABLE(full_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    agent.full_name
  from public.transfer_requests as transfer
  join public.profiles as agent
    on agent.id = transfer.agent_id
  where transfer.id = p_transfer_id
    and transfer.agent_id is not null
    and (
      transfer.client_id = (select auth.uid())
      or transfer.agent_id = (select auth.uid())
    );
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (
    id,
    full_name,
    role
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    'client'
  );

  return new;
end;
$$;


--
-- Name: is_auditor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_auditor() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'auditor'
  );
$$;


--
-- Name: is_compliance_manager(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_compliance_manager() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'compliance_manager'
  );
$$;


--
-- Name: open_business_day(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_business_day(p_business_date date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_day_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select profile.role into v_role
  from public.profiles as profile
  where profile.id = v_actor_id;

  if v_role <> 'management' then
    raise exception 'Only Management can open the business day.' using errcode = '42501';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required.';
  end if;

  if exists (
    select 1 from public.business_days where status in ('open', 'closing')
  ) then
    raise exception 'A business day is still active or closing. Finalize it before opening another business day.';
  end if;

  insert into public.business_days (business_date, status, opened_at, opened_by)
  values (p_business_date, 'open', now(), v_actor_id)
  on conflict (business_date)
  do update set
    status = 'open',
    opened_at = now(),
    opened_by = v_actor_id,
    closed_at = null,
    closed_by = null
  returning id into v_day_id;

  insert into public.transaction_events (transaction_id, actor_id, event_type, notes)
  values (
    null,
    v_actor_id,
    'business_day_opened',
    'Business day opened: ' || p_business_date::text || '. Management explicitly confirmed the company cash health review before opening.'
  );

  return v_day_id;
exception
  when unique_violation then
    raise exception 'Another business day was opened at the same time. Please refresh and try again.';
end;
$$;


--
-- Name: open_paybot_cash_session(date, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_paybot_cash_session(p_cash_date date, p_currency text, p_opening_cash numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid;
  v_session_id uuid;
  v_business_date date;
  v_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and role = 'paybot'
  ) then
    raise exception 'Only Paybots can open cash sessions' using errcode = '42501';
  end if;

  if p_opening_cash < 0 then
    raise exception 'Opening cash cannot be negative';
  end if;

  if btrim(p_currency) = '' then
    raise exception 'Currency is required';
  end if;

  select business_date, status
    into v_business_date, v_status
  from public.business_days
  where status in ('open', 'closing')
  order by opened_at desc
  limit 1;

  if v_business_date is null then
    raise exception 'There is no active business day. You cannot open a Paybot cash session.' using errcode = 'P0001';
  end if;

  if v_status <> 'open' then
    raise exception 'The business day is closing. New Paybot cash sessions cannot be opened.' using errcode = 'P0001';
  end if;

  if p_cash_date <> v_business_date then
    raise exception 'Cash session date must match the current business day (%).', v_business_date using errcode = 'P0001';
  end if;

  insert into public.paybot_cash_sessions (
    paybot_id,
    cash_date,
    currency,
    opening_cash
  )
  values (
    v_user_id,
    v_business_date,
    upper(trim(p_currency)),
    p_opening_cash
  )
  returning id into v_session_id;

  return v_session_id;

exception
  when unique_violation then
    raise exception 'A cash session already exists for this date and currency.' using errcode = '23505';
end;
$$;


--
-- Name: paybot_accept_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.paybot_accept_transfer(p_transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_user_id uuid;
    v_business_day_id uuid;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if not exists (
        select 1
        from public.profiles
        where id = v_user_id
          and role = 'paybot'
    ) then
        raise exception 'Only Paybots can accept transfers'
            using errcode = '42501';
    end if;

    -- Paybots may claim transfers during OPEN or CLOSING.
    -- CLOSING only blocks creation of new transfers and new cash sessions.
    select id
    into v_business_day_id
    from public.business_days
    where status in ('open', 'closing')
    order by opened_at desc
    limit 1;

    if v_business_day_id is null then
        raise exception
            'There is no active business day. Paybots cannot claim transfers.'
            using errcode = 'P0001';
    end if;

    -- Atomic claim. The transfer must belong to the current business day,
    -- which guarantees that a transfer from an older/finalized day cannot
    -- be claimed after that day has been closed.
    update public.transfer_requests as transfer
    set
        paybot_id = v_user_id,
        status = 'paybot_accepted'
    where transfer.id = p_transfer_id
      and transfer.business_day_id = v_business_day_id
      and transfer.status = 'sent_to_paybot'
      and transfer.paybot_id is null
      and exists (
          select 1
          from public.paybot_country_assignments as assignment
          where assignment.paybot_id = v_user_id
            and assignment.destination_country = transfer.destination_country
      );

    if not found then
        raise exception
            'Transfer is unavailable, already claimed, belongs to a different business day, or you are not assigned to its destination country.'
            using errcode = 'P0001';
    end if;

    insert into public.transaction_events (
        transaction_id,
        actor_id,
        event_type,
        notes
    )
    values (
        p_transfer_id,
        v_user_id,
        'paybot_accepted',
        'Transfer claimed by Paybot.'
    );
end;
$$;


--
-- Name: record_paybot_cash_receipt(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_paybot_cash_receipt(p_session_id uuid, p_amount numeric, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_role text;
  v_paybot_id uuid;
  v_receipt_id uuid;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = (select auth.uid());

  if v_role <> 'paybot' then
    raise exception 'Only paybots can record cash receipts';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Receipt amount must be greater than zero';
  end if;

  select s.paybot_id into v_paybot_id
  from public.paybot_cash_sessions s
  where s.id = p_session_id
    and s.paybot_id = (select auth.uid())
    and s.closed_at is null;

  if v_paybot_id is null then
    raise exception 'Cash session not found, not owned by you, or already closed';
  end if;

  insert into public.paybot_cash_receipts (session_id, amount, notes)
  values (p_session_id, p_amount, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_receipt_id;

  return v_receipt_id;
end;
$$;


--
-- Name: register_agent_evidence(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_agent_evidence(p_transfer_id uuid, p_file_name text, p_file_type text, p_storage_path text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid;
  v_attachment_id uuid;
  v_transfer public.transfer_requests;
begin
  v_user_id := (select auth.uid());

  -- Make sure the caller is authenticated.
  if v_user_id is null then
    raise exception 'You must be logged in';
  end if;

  -- Make sure the caller is an agent.
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and profile.role = 'agent'
  ) then
    raise exception 'Access denied';
  end if;

  -- Get and lock the transfer.
  select transfer.*
  into v_transfer
  from public.transfer_requests as transfer
  where transfer.id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  -- Only the assigned agent can upload payment evidence.
  if v_transfer.agent_id <> v_user_id then
    raise exception 'You are not the assigned agent for this transfer';
  end if;

  -- Payment evidence is uploaded after client payment is confirmed.
  if v_transfer.status <> 'payment_confirmed' then
    raise exception
      'Payment evidence can only be uploaded after payment is confirmed';
  end if;

  -- Basic validation.
  if btrim(coalesce(p_file_name, '')) = '' then
    raise exception 'File name is required';
  end if;

  if btrim(coalesce(p_storage_path, '')) = '' then
    raise exception 'Storage path is required';
  end if;

  -- Make sure the storage path belongs to this transaction.
  if p_storage_path not like
    'transactions/' || p_transfer_id::text || '/agent/%'
  then
    raise exception 'Invalid evidence storage path';
  end if;

  -- Register the evidence.
  insert into public.attachments (
    transaction_id,
    uploaded_by,
    file_name,
    file_type,
    storage_path,
    evidence_type
  )
  values (
    p_transfer_id,
    v_user_id,
    p_file_name,
    p_file_type,
    p_storage_path,
    'agent_payment'
  )
  returning id
  into v_attachment_id;

  -- Record the audit event.
  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    p_transfer_id,
    v_user_id,
    'agent_payment_evidence_uploaded',
    'Agent uploaded client payment evidence.'
  );

  return v_attachment_id;
end;
$$;


--
-- Name: register_paybot_payout_evidence(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_paybot_payout_evidence(p_transfer_id uuid, p_file_name text, p_file_type text, p_storage_path text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_actor_id uuid := auth.uid();
begin

  if v_actor_id is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;


  -- Verify the Paybot owns this transfer.
  if not exists (
    select 1
    from public.transfer_requests
    where id = p_transfer_id
      and paybot_id = v_actor_id
      and status in (
        'paybot_accepted',
        'paybot_pending'
      )
  ) then
    raise exception
      'You are not authorized to upload payout evidence for this transfer.'
      using errcode = '42501';
  end if;


  -- Make sure the storage path belongs to this transfer.
  if p_storage_path !~ (
    '^transactions/'
    || p_transfer_id::text
    || '/paybot/[^/]+$'
  ) then
    raise exception
      'Invalid payout evidence storage path.'
      using errcode = '22023';
  end if;


  -- Make sure the file actually exists in the private bucket.
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'transaction-evidence'
      and name = p_storage_path
  ) then
    raise exception
      'Payout evidence file was not found in storage.'
      using errcode = 'P0001';
  end if;


  -- Record the evidence.
  insert into public.attachments (
    transaction_id,
    uploaded_by,
    file_name,
    file_type,
    storage_path,
    evidence_type
  )
  values (
    p_transfer_id,
    v_actor_id,
    p_file_name,
    p_file_type,
    p_storage_path,
    'paybot_payout'
  );


  -- Record the event.
  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    p_transfer_id,
    v_actor_id,
    'paybot_payout_evidence_uploaded',
    'Paybot payout evidence uploaded.'
  );

end;
$_$;


--
-- Name: request_paybot_cash_correction(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_paybot_cash_correction(p_session_id uuid, p_requested_closing_cash numeric, p_reason text) RETURNS public.paybot_cash_correction_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_session public.paybot_cash_sessions%rowtype;
  v_existing_request boolean;
  v_request public.paybot_cash_correction_requests;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_actor_id;

  if v_role <> 'paybot' then
    raise exception 'Only paybots can request cash corrections.' using errcode = '42501';
  end if;

  if p_requested_closing_cash is null or p_requested_closing_cash < 0 then
    raise exception 'Requested closing cash must be zero or greater.';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'A correction reason is required.';
  end if;

  select * into v_session
  from public.paybot_cash_sessions s
  where s.id = p_session_id
    and s.paybot_id = v_actor_id
  for update;

  if not found then
    raise exception 'Cash session not found or not owned by you.';
  end if;

  if v_session.closed_at is null or v_session.closing_cash is null then
    raise exception 'Only a closed cash session can have a correction requested.';
  end if;

  if v_session.closing_cash = p_requested_closing_cash then
    raise exception 'The requested closing cash is the same as the current value.';
  end if;

  select exists (
    select 1
    from public.paybot_cash_correction_requests r
    where r.session_id = v_session.id
  ) into v_existing_request;

  if v_existing_request then
    raise exception 'This cash session has already used its one allowed correction request.';
  end if;

  insert into public.paybot_cash_correction_requests (
    session_id,
    paybot_id,
    old_closing_cash,
    requested_closing_cash,
    reason,
    status
  ) values (
    v_session.id,
    v_actor_id,
    v_session.closing_cash,
    p_requested_closing_cash,
    btrim(p_reason),
    'pending'
  )
  returning * into v_request;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  ) values (
    null,
    v_actor_id,
    'paybot_cash_correction_requested',
    'Cash session ' || v_session.id::text || ': ' ||
    v_session.closing_cash::text || ' -> ' || p_requested_closing_cash::text ||
    '. Reason: ' || btrim(p_reason)
  );

  return v_request;
end;
$$;


--
-- Name: require_auditor_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_auditor_role() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'auditor'
  ) THEN
    RAISE EXCEPTION 'Auditor access required';
  END IF;
END;
$$;


--
-- Name: require_compliance_manager_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_compliance_manager_role() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_role text;
begin
  select p.role into current_role
  from public.profiles p
  where p.id = auth.uid();

  if current_role <> 'compliance_manager' then
    raise exception 'Compliance Manager role required';
  end if;
end;
$$;


--
-- Name: require_management_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_management_role() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'management') then
    raise exception 'Management role required';
  end if;
end;
$$;


--
-- Name: require_open_business_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_open_business_day() RETURNS date
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_business_date date;
begin
  select day.business_date
    into v_business_date
  from public.business_days as day
  where day.status = 'open'
  order by day.opened_at desc
  limit 1;

  if v_business_date is null then
    raise exception 'The business day is closed. This operation is not allowed.'
      using errcode = 'P0001';
  end if;

  return v_business_date;
end;
$$;


--
-- Name: respond_to_compliance_notice(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_compliance_notice(p_recipient_row_id uuid, p_response_status text, p_response_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_response_status not in ('confirmed','declined','acknowledged') then
    raise exception 'Invalid response status';
  end if;

  update public.compliance_notice_recipients
  set response_status = p_response_status,
      response_note = p_response_note,
      responded_at = now()
  where id = p_recipient_row_id
    and recipient_id = auth.uid();

  if not found then
    raise exception 'Notice recipient record not found';
  end if;
end;
$$;


--
-- Name: resume_paybot_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resume_paybot_transfer(p_transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_actor_id
      and role = 'paybot'
  ) then
    raise exception 'Only Paybots can resume transfers.' using errcode = '42501';
  end if;

  update public.transfer_requests
  set status = 'paybot_accepted',
      pending_reason = null,
      pending_reason_code = null,
      pending_reason_details = null,
      pending_since = null
  where id = p_transfer_id
    and paybot_id = v_actor_id
    and status = 'paybot_pending';

  if not found then
    raise exception 'Only a pending transfer assigned to this Paybot can be resumed.' using errcode = 'P0001';
  end if;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  ) values (
    p_transfer_id,
    v_actor_id,
    'paybot_resumed',
    'Payment-pending transfer resumed by Paybot.'
  );
end;
$$;


--
-- Name: send_to_paybot(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_to_paybot(p_transfer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid;
  v_transfer public.transfer_requests;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'You must be logged in';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and profile.role = 'agent'
  ) then
    raise exception 'Access denied';
  end if;

  select transfer.*
  into v_transfer
  from public.transfer_requests as transfer
  where transfer.id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found';
  end if;

  if v_transfer.agent_id <> v_user_id then
    raise exception 'You are not the assigned agent for this transfer';
  end if;

  if v_transfer.status <> 'payment_confirmed' then
    raise exception
      'Only payment-confirmed transfers can be sent to Paybot';
  end if;

  if not exists (
    select 1
    from public.attachments as attachment
    where attachment.transaction_id = p_transfer_id
      and attachment.uploaded_by = v_user_id
      and attachment.evidence_type = 'agent_payment'
  ) then
    raise exception
      'Client payment evidence is required before sending to Paybot';
  end if;

  update public.transfer_requests
  set status = 'sent_to_paybot'
  where id = p_transfer_id;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  )
  values (
    p_transfer_id,
    v_user_id,
    'sent_to_paybot',
    'Agent sent the transfer to the Paybot queue.'
  );
end;
$$;


--
-- Name: set_paybot_transfer_pending(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_paybot_transfer_pending(p_transfer_id uuid, p_reason_code text, p_reason_details text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason_code text := lower(btrim(p_reason_code));
  v_details text := nullif(btrim(p_reason_details), '');
  v_transfer record;
begin
  if v_actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_actor_id
      and role = 'paybot'
  ) then
    raise exception 'Only Paybots can place transfers on payment pending.' using errcode = '42501';
  end if;

  if v_reason_code not in (
    'recipient_unavailable',
    'recipient_requested_later',
    'technical_issue',
    'identity_verification_issue',
    'incorrect_recipient_information',
    'other'
  ) then
    raise exception 'Invalid payment-pending reason.' using errcode = 'P0001';
  end if;

  if v_reason_code = 'other' and v_details is null then
    raise exception 'Details are required when the reason is Other.' using errcode = 'P0001';
  end if;

  select *
    into v_transfer
  from public.transfer_requests
  where id = p_transfer_id
    and paybot_id = v_actor_id
  for update;

  if not found then
    raise exception 'Transfer was not found or is not assigned to this Paybot.' using errcode = 'P0001';
  end if;

  if v_transfer.status <> 'paybot_accepted' then
    raise exception 'Only an accepted transfer can be placed on payment pending.' using errcode = 'P0001';
  end if;

  update public.transfer_requests
  set status = 'paybot_pending',
      pending_reason = v_reason_code,
      pending_reason_code = v_reason_code,
      pending_reason_details = v_details,
      pending_since = now()
  where id = p_transfer_id
    and paybot_id = v_actor_id
    and status = 'paybot_accepted';

  if not found then
    raise exception 'Transfer could not be placed on pending because its status changed. Please refresh and try again.' using errcode = 'P0001';
  end if;

  insert into public.transaction_events (
    transaction_id,
    actor_id,
    event_type,
    notes
  ) values (
    p_transfer_id,
    v_actor_id,
    'paybot_pending',
    'Payment pending. Reason: ' || v_reason_code ||
      case when v_details is not null then '. Details: ' || v_details else '' end
  );
end;
$$;


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    uploaded_by uuid,
    file_name text NOT NULL,
    file_type text,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    evidence_type text,
    CONSTRAINT attachments_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['agent_payment'::text, 'paybot_payout'::text])))
);


--
-- Name: business_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_date date NOT NULL,
    status text DEFAULT 'closed'::text NOT NULL,
    opened_at timestamp with time zone,
    opened_by uuid,
    closed_at timestamp with time zone,
    closed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_days_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closing'::text, 'closed'::text])))
);


--
-- Name: compliance_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_id uuid,
    alert_type text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    reason text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    CONSTRAINT compliance_alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['high_value'::text, 'possible_duplicate'::text, 'manual'::text]))),
    CONSTRAINT compliance_alerts_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT compliance_alerts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reviewed'::text, 'dismissed'::text, 'escalated'::text])))
);


--
-- Name: compliance_notice_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_notice_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notice_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    response_status text DEFAULT 'pending'::text NOT NULL,
    responded_at timestamp with time zone,
    response_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT compliance_notice_recipients_response_status_check CHECK ((response_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'acknowledged'::text])))
);


--
-- Name: compliance_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL,
    notice_type text DEFAULT 'meeting'::text NOT NULL,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'normal'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    location text,
    meeting_link text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT compliance_notice_meeting_timing CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT compliance_notices_notice_type_check CHECK ((notice_type = ANY (ARRAY['meeting'::text, 'announcement'::text, 'reminder'::text, 'compliance_request'::text]))),
    CONSTRAINT compliance_notices_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'important'::text, 'urgent'::text]))),
    CONSTRAINT compliance_notices_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 200)))
);


--
-- Name: compliance_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    currency text NOT NULL,
    high_value_amount numeric NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_until timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT compliance_thresholds_check CHECK (((effective_until IS NULL) OR (effective_until > effective_from))),
    CONSTRAINT compliance_thresholds_high_value_amount_check CHECK ((high_value_amount > (0)::numeric))
);


--
-- Name: daily_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rate_date date NOT NULL,
    currency_from text NOT NULL,
    currency_to text NOT NULL,
    buy_rate numeric(20,8) NOT NULL,
    sell_rate numeric(20,8) NOT NULL,
    entered_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_rates_buy_rate_check CHECK ((buy_rate > (0)::numeric)),
    CONSTRAINT daily_rates_different_currencies CHECK ((currency_from <> currency_to)),
    CONSTRAINT daily_rates_sell_rate_check CHECK ((sell_rate > (0)::numeric))
);


--
-- Name: paybot_cash_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paybot_cash_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    paybot_id uuid NOT NULL,
    amount numeric(20,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paybot_cash_receipts_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: paybot_cash_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paybot_cash_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paybot_id uuid NOT NULL,
    cash_date date NOT NULL,
    currency text NOT NULL,
    opening_cash numeric(20,2) NOT NULL,
    closing_cash numeric(20,2),
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paybot_cash_sessions_opening_cash_check CHECK ((opening_cash >= (0)::numeric)),
    CONSTRAINT paybot_cash_sessions_valid_close CHECK (((closing_cash IS NULL) OR (closing_cash >= (0)::numeric)))
);


--
-- Name: paybot_country_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paybot_country_assignments (
    paybot_id uuid NOT NULL,
    destination_country text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paybot_country_assignments_destination_country_check CHECK ((btrim(destination_country) <> ''::text))
);


--
-- Name: paybot_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paybot_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    requested_countries text[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT paybot_registrations_requested_countries_check CHECK ((cardinality(requested_countries) > 0)),
    CONSTRAINT paybot_registrations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'suspended'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['client'::text, 'agent'::text, 'paybot'::text, 'auditor'::text, 'management'::text, 'analyst'::text, 'compliance_manager'::text])))
);


--
-- Name: transaction_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid,
    actor_id uuid,
    event_type text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transfer_archive_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_archive_daily_stats (
    stat_date date NOT NULL,
    agent_id uuid NOT NULL,
    paybot_id uuid NOT NULL,
    currency text NOT NULL,
    destination_currency text NOT NULL,
    destination_country text NOT NULL,
    completed_count bigint DEFAULT 0 NOT NULL,
    source_amount_total numeric DEFAULT 0 NOT NULL,
    destination_amount_total numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_name_snapshot text,
    paybot_name_snapshot text
);


--
-- Name: transfer_archive_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_archive_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    archived_count bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    error_message text,
    CONSTRAINT transfer_archive_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: transfer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    agent_id uuid,
    paybot_id uuid,
    amount numeric(15,2) NOT NULL,
    currency text NOT NULL,
    destination_country text NOT NULL,
    recipient_name text NOT NULL,
    recipient_phone text,
    status text DEFAULT 'requested'::text NOT NULL,
    pending_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    rate_id uuid,
    exchange_rate numeric(20,8),
    source_amount numeric(15,2),
    destination_amount numeric(20,8),
    destination_currency text,
    business_day_id uuid,
    pending_reason_code text,
    pending_reason_details text,
    pending_since timestamp with time zone,
    CONSTRAINT transfer_pending_reason_code_check CHECK (((pending_reason_code IS NULL) OR (pending_reason_code = ANY (ARRAY['recipient_unavailable'::text, 'recipient_requested_later'::text, 'technical_issue'::text, 'identity_verification_issue'::text, 'incorrect_recipient_information'::text, 'other'::text])))),
    CONSTRAINT transfer_pending_reason_consistency_check CHECK ((((status = 'paybot_pending'::text) AND (pending_reason_code IS NOT NULL) AND (btrim(pending_reason_code) <> ''::text) AND (pending_since IS NOT NULL)) OR ((status <> 'paybot_pending'::text) AND (pending_reason_code IS NULL) AND (pending_reason_details IS NULL) AND (pending_since IS NULL)))),
    CONSTRAINT transfer_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'agent_approved'::text, 'payment_confirmed'::text, 'sent_to_paybot'::text, 'paybot_accepted'::text, 'paybot_pending'::text, 'completed'::text, 'rejected'::text, 'cancelled'::text])))
);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: business_days business_days_business_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_business_date_key UNIQUE (business_date);


--
-- Name: business_days business_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_pkey PRIMARY KEY (id);


--
-- Name: compliance_alerts compliance_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_alerts
    ADD CONSTRAINT compliance_alerts_pkey PRIMARY KEY (id);


--
-- Name: compliance_notice_recipients compliance_notice_recipients_notice_id_recipient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_notice_recipients
    ADD CONSTRAINT compliance_notice_recipients_notice_id_recipient_id_key UNIQUE (notice_id, recipient_id);


--
-- Name: compliance_notice_recipients compliance_notice_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_notice_recipients
    ADD CONSTRAINT compliance_notice_recipients_pkey PRIMARY KEY (id);


--
-- Name: compliance_notices compliance_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_notices
    ADD CONSTRAINT compliance_notices_pkey PRIMARY KEY (id);


--
-- Name: compliance_thresholds compliance_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_thresholds
    ADD CONSTRAINT compliance_thresholds_pkey PRIMARY KEY (id);


--
-- Name: daily_rates daily_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_rates
    ADD CONSTRAINT daily_rates_pkey PRIMARY KEY (id);


--
-- Name: daily_rates daily_rates_unique_pair_per_day; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_rates
    ADD CONSTRAINT daily_rates_unique_pair_per_day UNIQUE (rate_date, currency_from, currency_to);


--
-- Name: paybot_cash_correction_requests paybot_cash_correction_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_correction_requests
    ADD CONSTRAINT paybot_cash_correction_requests_pkey PRIMARY KEY (id);


--
-- Name: paybot_cash_receipts paybot_cash_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_receipts
    ADD CONSTRAINT paybot_cash_receipts_pkey PRIMARY KEY (id);


--
-- Name: paybot_cash_sessions paybot_cash_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_sessions
    ADD CONSTRAINT paybot_cash_sessions_pkey PRIMARY KEY (id);


--
-- Name: paybot_cash_sessions paybot_cash_sessions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_sessions
    ADD CONSTRAINT paybot_cash_sessions_unique UNIQUE (paybot_id, cash_date, currency);


--
-- Name: paybot_country_assignments paybot_country_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_country_assignments
    ADD CONSTRAINT paybot_country_assignments_pkey PRIMARY KEY (paybot_id, destination_country);


--
-- Name: paybot_registrations paybot_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_registrations
    ADD CONSTRAINT paybot_registrations_pkey PRIMARY KEY (id);


--
-- Name: paybot_registrations paybot_registrations_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_registrations
    ADD CONSTRAINT paybot_registrations_user_id_key UNIQUE (user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: transaction_events transaction_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_events
    ADD CONSTRAINT transaction_events_pkey PRIMARY KEY (id);


--
-- Name: transfer_archive_daily_stats transfer_archive_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_archive_daily_stats
    ADD CONSTRAINT transfer_archive_daily_stats_pkey PRIMARY KEY (stat_date, agent_id, paybot_id, currency, destination_currency, destination_country);


--
-- Name: transfer_archive_runs transfer_archive_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_archive_runs
    ADD CONSTRAINT transfer_archive_runs_pkey PRIMARY KEY (id);


--
-- Name: transfer_requests transfer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_pkey PRIMARY KEY (id);


--
-- Name: attachments_transaction_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_transaction_id_idx ON public.attachments USING btree (transaction_id);


--
-- Name: attachments_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_uploaded_by_idx ON public.attachments USING btree (uploaded_by);


--
-- Name: business_days_closed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_days_closed_by_idx ON public.business_days USING btree (closed_by);


--
-- Name: business_days_one_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX business_days_one_open_idx ON public.business_days USING btree (status) WHERE (status = 'open'::text);


--
-- Name: business_days_opened_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_days_opened_by_idx ON public.business_days USING btree (opened_by);


--
-- Name: compliance_alerts_reviewed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_alerts_reviewed_by_idx ON public.compliance_alerts USING btree (reviewed_by);


--
-- Name: compliance_thresholds_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_thresholds_created_by_idx ON public.compliance_thresholds USING btree (created_by);


--
-- Name: daily_rates_currency_pair_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_rates_currency_pair_idx ON public.daily_rates USING btree (currency_from, currency_to, rate_date DESC);


--
-- Name: daily_rates_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_rates_date_idx ON public.daily_rates USING btree (rate_date DESC);


--
-- Name: daily_rates_entered_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_rates_entered_by_idx ON public.daily_rates USING btree (entered_by);


--
-- Name: idx_compliance_alerts_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_alerts_status_created ON public.compliance_alerts USING btree (status, created_at DESC);


--
-- Name: idx_compliance_alerts_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_alerts_transfer ON public.compliance_alerts USING btree (transfer_id);


--
-- Name: idx_compliance_notice_recipients_notice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_notice_recipients_notice ON public.compliance_notice_recipients USING btree (notice_id);


--
-- Name: idx_compliance_notice_recipients_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_notice_recipients_recipient ON public.compliance_notice_recipients USING btree (recipient_id);


--
-- Name: idx_compliance_notices_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_notices_created_by ON public.compliance_notices USING btree (created_by);


--
-- Name: idx_compliance_notices_starts_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_notices_starts_at ON public.compliance_notices USING btree (starts_at);


--
-- Name: idx_compliance_thresholds_currency_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_thresholds_currency_dates ON public.compliance_thresholds USING btree (currency, effective_from DESC);


--
-- Name: paybot_cash_correction_requests_approved_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_cash_correction_requests_approved_by_idx ON public.paybot_cash_correction_requests USING btree (approved_by);


--
-- Name: paybot_cash_correction_requests_paybot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_cash_correction_requests_paybot_idx ON public.paybot_cash_correction_requests USING btree (paybot_id, created_at DESC);


--
-- Name: paybot_cash_correction_requests_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_cash_correction_requests_session_idx ON public.paybot_cash_correction_requests USING btree (session_id, created_at DESC);


--
-- Name: paybot_cash_correction_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_cash_correction_requests_status_idx ON public.paybot_cash_correction_requests USING btree (status, created_at DESC);


--
-- Name: paybot_cash_receipts_paybot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_cash_receipts_paybot_idx ON public.paybot_cash_receipts USING btree (paybot_id, created_at DESC);


--
-- Name: paybot_cash_receipts_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_cash_receipts_session_idx ON public.paybot_cash_receipts USING btree (session_id);


--
-- Name: paybot_cash_sessions_paybot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_cash_sessions_paybot_date_idx ON public.paybot_cash_sessions USING btree (paybot_id, cash_date DESC);


--
-- Name: paybot_country_assignments_country_paybot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_country_assignments_country_paybot_idx ON public.paybot_country_assignments USING btree (destination_country, paybot_id);


--
-- Name: paybot_registrations_reviewed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX paybot_registrations_reviewed_by_idx ON public.paybot_registrations USING btree (reviewed_by);


--
-- Name: transaction_events_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_events_actor_id_idx ON public.transaction_events USING btree (actor_id);


--
-- Name: transaction_events_transaction_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_events_transaction_id_idx ON public.transaction_events USING btree (transaction_id);


--
-- Name: transfer_archive_daily_stats_agent_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_archive_daily_stats_agent_date_idx ON public.transfer_archive_daily_stats USING btree (agent_id, stat_date DESC);


--
-- Name: transfer_archive_daily_stats_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_archive_daily_stats_date_idx ON public.transfer_archive_daily_stats USING btree (stat_date DESC);


--
-- Name: transfer_archive_daily_stats_paybot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_archive_daily_stats_paybot_date_idx ON public.transfer_archive_daily_stats USING btree (paybot_id, stat_date DESC);


--
-- Name: transfer_requests_agent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_agent_id_idx ON public.transfer_requests USING btree (agent_id);


--
-- Name: transfer_requests_agent_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_agent_status_created_idx ON public.transfer_requests USING btree (agent_id, status, created_at DESC);


--
-- Name: transfer_requests_business_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_business_day_idx ON public.transfer_requests USING btree (business_day_id);


--
-- Name: transfer_requests_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_client_id_idx ON public.transfer_requests USING btree (client_id);


--
-- Name: transfer_requests_completed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_completed_at_idx ON public.transfer_requests USING btree (completed_at DESC) WHERE (status = 'completed'::text);


--
-- Name: transfer_requests_paybot_currency_status_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_paybot_currency_status_completed_idx ON public.transfer_requests USING btree (paybot_id, destination_currency, status, completed_at) WHERE (status = 'completed'::text);


--
-- Name: transfer_requests_paybot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_paybot_id_idx ON public.transfer_requests USING btree (paybot_id);


--
-- Name: transfer_requests_paybot_pending_since_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_paybot_pending_since_idx ON public.transfer_requests USING btree (pending_since) WHERE (status = 'paybot_pending'::text);


--
-- Name: transfer_requests_paybot_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_paybot_queue_idx ON public.transfer_requests USING btree (status, destination_country, created_at) WHERE ((status = 'sent_to_paybot'::text) AND (paybot_id IS NULL));


--
-- Name: transfer_requests_paybot_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_paybot_status_created_idx ON public.transfer_requests USING btree (paybot_id, status, created_at DESC);


--
-- Name: transfer_requests_rate_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transfer_requests_rate_id_idx ON public.transfer_requests USING btree (rate_id);


--
-- Name: uq_compliance_alerts_transfer_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_compliance_alerts_transfer_type ON public.compliance_alerts USING btree (transfer_id, alert_type) WHERE (transfer_id IS NOT NULL);


--
-- Name: daily_rates enforce_daily_rate_business_day; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_daily_rate_business_day BEFORE INSERT OR UPDATE OF rate_date ON public.daily_rates FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_rate_business_day();


--
-- Name: paybot_cash_receipts enforce_paybot_cash_receipt_business_day; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_paybot_cash_receipt_business_day BEFORE INSERT ON public.paybot_cash_receipts FOR EACH ROW EXECUTE FUNCTION public.enforce_paybot_cash_receipt_business_day();


--
-- Name: paybot_cash_sessions enforce_paybot_cash_session_close_business_day; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_paybot_cash_session_close_business_day BEFORE UPDATE OF closing_cash, closed_at ON public.paybot_cash_sessions FOR EACH ROW WHEN (((new.closed_at IS NOT NULL) OR (new.closing_cash IS NOT NULL))) EXECUTE FUNCTION public.enforce_cash_business_day();


--
-- Name: transfer_requests enforce_transfer_business_day; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_transfer_business_day BEFORE INSERT OR UPDATE OF status, business_day_id ON public.transfer_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_transfer_business_day();


--
-- Name: transfer_requests on_transfer_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_transfer_created AFTER INSERT ON public.transfer_requests FOR EACH ROW EXECUTE FUNCTION public.create_transfer_event();


--
-- Name: transfer_requests trg_evaluate_compliance_transfer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_evaluate_compliance_transfer AFTER INSERT ON public.transfer_requests FOR EACH ROW EXECUTE FUNCTION public.evaluate_compliance_transfer();


--
-- Name: attachments attachments_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transfer_requests(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);


--
-- Name: business_days business_days_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id);


--
-- Name: business_days business_days_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_days
    ADD CONSTRAINT business_days_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id);


--
-- Name: compliance_alerts compliance_alerts_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_alerts
    ADD CONSTRAINT compliance_alerts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: compliance_alerts compliance_alerts_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_alerts
    ADD CONSTRAINT compliance_alerts_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.transfer_requests(id) ON DELETE CASCADE;


--
-- Name: compliance_notice_recipients compliance_notice_recipients_notice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_notice_recipients
    ADD CONSTRAINT compliance_notice_recipients_notice_id_fkey FOREIGN KEY (notice_id) REFERENCES public.compliance_notices(id) ON DELETE CASCADE;


--
-- Name: compliance_notice_recipients compliance_notice_recipients_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_notice_recipients
    ADD CONSTRAINT compliance_notice_recipients_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: compliance_notices compliance_notices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_notices
    ADD CONSTRAINT compliance_notices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: compliance_thresholds compliance_thresholds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_thresholds
    ADD CONSTRAINT compliance_thresholds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: daily_rates daily_rates_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_rates
    ADD CONSTRAINT daily_rates_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.profiles(id);


--
-- Name: paybot_cash_correction_requests paybot_cash_correction_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_correction_requests
    ADD CONSTRAINT paybot_cash_correction_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: paybot_cash_correction_requests paybot_cash_correction_requests_paybot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_correction_requests
    ADD CONSTRAINT paybot_cash_correction_requests_paybot_id_fkey FOREIGN KEY (paybot_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: paybot_cash_correction_requests paybot_cash_correction_requests_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_correction_requests
    ADD CONSTRAINT paybot_cash_correction_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.paybot_cash_sessions(id) ON DELETE RESTRICT;


--
-- Name: paybot_cash_receipts paybot_cash_receipts_paybot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_receipts
    ADD CONSTRAINT paybot_cash_receipts_paybot_id_fkey FOREIGN KEY (paybot_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: paybot_cash_receipts paybot_cash_receipts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_receipts
    ADD CONSTRAINT paybot_cash_receipts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.paybot_cash_sessions(id) ON DELETE CASCADE;


--
-- Name: paybot_cash_sessions paybot_cash_sessions_paybot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_cash_sessions
    ADD CONSTRAINT paybot_cash_sessions_paybot_id_fkey FOREIGN KEY (paybot_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: paybot_country_assignments paybot_country_assignments_paybot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_country_assignments
    ADD CONSTRAINT paybot_country_assignments_paybot_id_fkey FOREIGN KEY (paybot_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: paybot_registrations paybot_registrations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_registrations
    ADD CONSTRAINT paybot_registrations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: paybot_registrations paybot_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paybot_registrations
    ADD CONSTRAINT paybot_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: transaction_events transaction_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_events
    ADD CONSTRAINT transaction_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: transaction_events transaction_events_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_events
    ADD CONSTRAINT transaction_events_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transfer_requests(id) ON DELETE CASCADE;


--
-- Name: transfer_requests transfer_requests_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: transfer_requests transfer_requests_business_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_business_day_id_fkey FOREIGN KEY (business_day_id) REFERENCES public.business_days(id);


--
-- Name: transfer_requests transfer_requests_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id);


--
-- Name: transfer_requests transfer_requests_paybot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_paybot_id_fkey FOREIGN KEY (paybot_id) REFERENCES public.profiles(id);


--
-- Name: transfer_requests transfer_requests_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_requests
    ADD CONSTRAINT transfer_requests_rate_id_fkey FOREIGN KEY (rate_id) REFERENCES public.daily_rates(id);


--
-- Name: transfer_requests Agents can view assigned transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view assigned transfers" ON public.transfer_requests FOR SELECT TO authenticated USING ((agent_id = ( SELECT auth.uid() AS uid)));


--
-- Name: transaction_events Agents can view events for assigned transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Agents can view events for assigned transfers" ON public.transaction_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.transfer_requests
  WHERE ((transfer_requests.id = transaction_events.transaction_id) AND (transfer_requests.agent_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: daily_rates Analyst can enter daily rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Analyst can enter daily rates" ON public.daily_rates FOR INSERT TO authenticated WITH CHECK (((entered_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'analyst'::text))))));


--
-- Name: transfer_requests Auditors and management can view all transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auditors and management can view all transfers" ON public.transfer_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['auditor'::text, 'management'::text]))))));


--
-- Name: profiles Auditors can view Paybot profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auditors can view Paybot profiles" ON public.profiles FOR SELECT TO authenticated USING (((role = 'paybot'::text) AND public.is_auditor()));


--
-- Name: daily_rates Authorized rate staff can view daily rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized rate staff can view daily rates" ON public.daily_rates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['management'::text, 'analyst'::text, 'auditor'::text]))))));


--
-- Name: transfer_archive_runs Authorized staff can view transfer archive runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized staff can view transfer archive runs" ON public.transfer_archive_runs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['management'::text, 'analyst'::text, 'auditor'::text]))))));


--
-- Name: transfer_archive_daily_stats Authorized staff can view transfer archive stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized staff can view transfer archive stats" ON public.transfer_archive_daily_stats FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['management'::text, 'analyst'::text, 'auditor'::text]))))));


--
-- Name: transfer_requests Clients can create their own transfer requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can create their own transfer requests" ON public.transfer_requests FOR INSERT TO authenticated WITH CHECK ((client_id = ( SELECT auth.uid() AS uid)));


--
-- Name: transaction_events Clients can view events for their own transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view events for their own transfers" ON public.transaction_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.transfer_requests
  WHERE ((transfer_requests.id = transaction_events.transaction_id) AND (transfer_requests.client_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: attachments Clients can view their own payout evidence records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their own payout evidence records" ON public.attachments FOR SELECT TO authenticated USING (((evidence_type = 'paybot_payout'::text) AND (EXISTS ( SELECT 1
   FROM public.transfer_requests transfer
  WHERE ((transfer.id = attachments.transaction_id) AND (transfer.client_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: transfer_requests Clients can view their own transfer requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their own transfer requests" ON public.transfer_requests FOR SELECT TO authenticated USING ((client_id = ( SELECT auth.uid() AS uid)));


--
-- Name: compliance_alerts Compliance alerts read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Compliance alerts read" ON public.compliance_alerts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['management'::text, 'compliance_manager'::text, 'auditor'::text]))))));


--
-- Name: compliance_thresholds Compliance and analyst manage thresholds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Compliance and analyst manage thresholds" ON public.compliance_thresholds TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['compliance_manager'::text, 'analyst'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['compliance_manager'::text, 'analyst'::text]))))));


--
-- Name: compliance_alerts Compliance manager updates alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Compliance manager updates alerts" ON public.compliance_alerts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'compliance_manager'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'compliance_manager'::text)))));


--
-- Name: profiles Compliance managers can view workforce and oversight profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Compliance managers can view workforce and oversight profiles" ON public.profiles FOR SELECT TO authenticated USING (((role = ANY (ARRAY['agent'::text, 'paybot'::text, 'auditor'::text, 'management'::text, 'analyst'::text])) AND public.is_compliance_manager()));


--
-- Name: transfer_requests Eligible Paybots can view unclaimed country queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Eligible Paybots can view unclaimed country queue" ON public.transfer_requests FOR SELECT TO authenticated USING (((status = 'sent_to_paybot'::text) AND (paybot_id IS NULL) AND (EXISTS ( SELECT 1
   FROM (public.profiles profile
     JOIN public.paybot_country_assignments assignment ON ((assignment.paybot_id = profile.id)))
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.role = 'paybot'::text) AND (assignment.destination_country = transfer_requests.destination_country))))));


--
-- Name: paybot_cash_receipts Management and auditors can view cash receipts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Management and auditors can view cash receipts" ON public.paybot_cash_receipts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['management'::text, 'auditor'::text]))))));


--
-- Name: paybot_cash_sessions Management and auditors can view cash sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Management and auditors can view cash sessions" ON public.paybot_cash_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['management'::text, 'auditor'::text]))))));


--
-- Name: paybot_registrations Management can view Paybot registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Management can view Paybot registrations" ON public.paybot_registrations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'management'::text)))));


--
-- Name: compliance_thresholds Management compliance threshold read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Management compliance threshold read" ON public.compliance_thresholds FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['management'::text, 'compliance_manager'::text, 'analyst'::text, 'auditor'::text]))))));


--
-- Name: transfer_requests Paybots can view assigned transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Paybots can view assigned transfers" ON public.transfer_requests FOR SELECT TO authenticated USING ((paybot_id = ( SELECT auth.uid() AS uid)));


--
-- Name: transaction_events Paybots can view events for claimed transfers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Paybots can view events for claimed transfers" ON public.transaction_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.profiles profile
     JOIN public.transfer_requests transfer ON ((transfer.id = transaction_events.transaction_id)))
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.role = 'paybot'::text) AND (transfer.paybot_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: paybot_cash_receipts Paybots can view own cash receipts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Paybots can view own cash receipts" ON public.paybot_cash_receipts FOR SELECT TO authenticated USING ((paybot_id = ( SELECT auth.uid() AS uid)));


--
-- Name: paybot_cash_sessions Paybots can view own cash sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Paybots can view own cash sessions" ON public.paybot_cash_sessions FOR SELECT TO authenticated USING ((paybot_id = ( SELECT auth.uid() AS uid)));


--
-- Name: paybot_country_assignments Paybots can view own country assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Paybots can view own country assignments" ON public.paybot_country_assignments FOR SELECT TO authenticated USING (((paybot_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.profiles profile
  WHERE ((profile.id = ( SELECT auth.uid() AS uid)) AND (profile.role = 'paybot'::text))))));


--
-- Name: paybot_registrations Users can create their own Paybot registration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own Paybot registration" ON public.paybot_registrations FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: paybot_registrations Users can view their own Paybot registration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own Paybot registration" ON public.paybot_registrations FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: business_days; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_days ENABLE ROW LEVEL SECURITY;

--
-- Name: business_days business_days_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_days_select_authenticated ON public.business_days FOR SELECT TO authenticated USING (true);


--
-- Name: compliance_notice_recipients compliance managers can add recipients to own notices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compliance managers can add recipients to own notices" ON public.compliance_notice_recipients FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.compliance_notices n
  WHERE ((n.id = compliance_notice_recipients.notice_id) AND (n.created_by = ( SELECT auth.uid() AS uid))))) AND (public.require_compliance_manager_role() IS NULL)));


--
-- Name: compliance_notices compliance managers can create notices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compliance managers can create notices" ON public.compliance_notices FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (public.require_compliance_manager_role() IS NULL)));


--
-- Name: compliance_notices compliance managers can view notices they created; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compliance managers can view notices they created" ON public.compliance_notices FOR SELECT TO authenticated USING (((created_by = ( SELECT auth.uid() AS uid)) AND (public.require_compliance_manager_role() IS NULL)));


--
-- Name: compliance_notice_recipients compliance managers can view recipients for own notices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compliance managers can view recipients for own notices" ON public.compliance_notice_recipients FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.compliance_notices n
  WHERE ((n.id = compliance_notice_recipients.notice_id) AND (n.created_by = ( SELECT auth.uid() AS uid))))) AND (public.require_compliance_manager_role() IS NULL)));


--
-- Name: compliance_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_notice_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_notice_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_thresholds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_thresholds ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: paybot_cash_correction_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paybot_cash_correction_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: paybot_cash_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paybot_cash_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: paybot_cash_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paybot_cash_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: paybot_country_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paybot_country_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: paybot_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paybot_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_notice_recipients recipients can respond to their notices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recipients can respond to their notices" ON public.compliance_notice_recipients FOR UPDATE TO authenticated USING ((recipient_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((recipient_id = ( SELECT auth.uid() AS uid)) AND (response_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'acknowledged'::text])) AND (responded_at IS NOT NULL)));


--
-- Name: compliance_notices recipients can view addressed notices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recipients can view addressed notices" ON public.compliance_notices FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.compliance_notice_recipients r
  WHERE ((r.notice_id = compliance_notices.id) AND (r.recipient_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: compliance_notice_recipients recipients can view their own notice rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recipients can view their own notice rows" ON public.compliance_notice_recipients FOR SELECT TO authenticated USING ((recipient_id = ( SELECT auth.uid() AS uid)));


--
-- Name: transaction_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transaction_events ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_archive_daily_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_archive_daily_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_archive_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_archive_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict lXcgJelm42Wu7Num05aKbyFAKhivqpJwuKpTMUoTdVmkZSVLQ4jMeb4f0lYoVzX

