-- Apply ONLY to spkoqjfpiurtjbfrtcvh. Never apply to Standard.
alter table public.vehicle_booking_requests add column if not exists dispatched_at timestamptz;
alter table public.vehicle_booking_requests add column if not exists completed_at timestamptz;
alter table public.vehicle_booking_requests add column if not exists actual_freight_total numeric check(actual_freight_total>=0);
alter table public.delivery_trips add column if not exists booking_id uuid references public.vehicle_booking_requests(id);
create index if not exists delivery_trips_booking_idx on public.delivery_trips(booking_id);
create unique index if not exists premium_booking_order_trip on public.delivery_trips(booking_id,order_id) where booking_id is not null;

-- Close bootstrap elevation after the designated Admin has been created.
revoke execute on function public.claim_first_admin() from public, anon, authenticated;

create or replace function private.premium_trip_guard() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
 if new.vehicle_id is not null then
  perform 1 from vehicles where id=new.vehicle_id and company_id=new.company_id for update;
  if not found then raise exception 'INVALID_VEHICLE'; end if;
  if exists(select 1 from vehicle_booking_requests b where b.vehicle_id=new.vehicle_id and b.company_id=new.company_id and b.status in ('PENDING','CONFIRMED') and b.completed_at is null and b.id is distinct from new.booking_id and b.requested_start<new.planned_end and b.requested_end>new.planned_start) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
  if exists(select 1 from delivery_trips t where t.vehicle_id=new.vehicle_id and t.company_id=new.company_id and t.status not in ('COMPLETED','CANCELLED') and (new.booking_id is null or t.booking_id is distinct from new.booking_id) and t.planned_start<new.planned_end and t.planned_end>new.planned_start) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
 end if;
 if new.booking_id is null and exists(select 1 from vehicle_booking_orders bo join vehicle_booking_requests b on b.id=bo.booking_id where bo.order_id=new.order_id and bo.company_id=new.company_id and b.status in ('PENDING','CONFIRMED') and b.completed_at is null) then raise exception 'BOOKING_REQUIRES_GROUP_DISPATCH'; end if;
 return new;
end $$;
revoke all on function private.premium_trip_guard() from public,anon,authenticated;
create trigger premium_trip_guard before insert on public.delivery_trips for each row execute function private.premium_trip_guard();

create or replace function public.premium_dispatch_booking(p_booking_id uuid,p_driver_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare ctx record; b record; o record; tid uuid; tno text; ids jsonb:='[]';
begin
 select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
 select * into b from vehicle_booking_requests where id=p_booking_id and company_id=ctx.company_id;
 if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
 perform 1 from vehicles where id=b.vehicle_id and company_id=ctx.company_id and active for update;
 if not found then raise exception 'VEHICLE_NOT_AVAILABLE'; end if;
 select * into b from vehicle_booking_requests where id=p_booking_id for update;
 if b.dispatched_at is not null then return jsonb_build_object('id',b.id,'idempotent',true); end if;
 if b.status<>'CONFIRMED' then raise exception 'BOOKING_NOT_CONFIRMED'; end if;
 if p_driver_id is not null and not exists(select 1 from drivers where id=p_driver_id and company_id=ctx.company_id and active) then raise exception 'INVALID_DRIVER'; end if;
 for o in select x.* from orders x join vehicle_booking_orders bo on bo.order_id=x.id where bo.booking_id=b.id and x.company_id=ctx.company_id order by x.id for update of x loop
  if o.status<>'WAITING_LOGISTICS' then raise exception 'ORDER_NOT_READY_FOR_DELIVERY'; end if;
  if not exists(select 1 from order_lines where order_id=o.id and issued_qty>0) then raise exception 'ORDER_NOT_READY_FOR_DELIVERY'; end if;
  tno:=private.next_doc_no('TRIP-','public.delivery_trips'::regclass,'trip_no',ctx.company_id);
  insert into delivery_trips(company_id,trip_no,order_id,vehicle_id,driver_id,planned_start,planned_end,standard_freight,status,request_id,booking_id)
  values(ctx.company_id,tno,o.id,b.vehicle_id,p_driver_id,b.requested_start,b.requested_end,0,'PLANNED','PB-'||b.id||'-'||o.id,b.id) returning id into tid;
  insert into delivery_trip_lines(company_id,trip_id,order_line_id,product_id,issued_qty) select ctx.company_id,tid,id,product_id,issued_qty from order_lines where order_id=o.id and issued_qty>0;
  update orders set status='IN_DELIVERY' where id=o.id;
  ids:=ids||jsonb_build_object('trip_id',tid,'order_id',o.id);
 end loop;
 if jsonb_array_length(ids)=0 then raise exception 'ORDER_REQUIRED'; end if;
 update vehicle_booking_requests set dispatched_at=now(),updated_at=now() where id=b.id;
 insert into audit_logs(company_id,user_id,action,entity_type,entity_id,after_data) values(ctx.company_id,auth.uid(),'PREMIUM_DISPATCH','VEHICLE_BOOKING',b.id::text,ids);
 return jsonb_build_object('id',b.id,'trips',ids,'idempotent',false);
end $$;
revoke all on function public.premium_dispatch_booking(uuid,uuid) from public,anon;
grant execute on function public.premium_dispatch_booking(uuid,uuid) to authenticated;

-- Keep the original accounting routine private; group invoices must reconcile first.
alter function public.complete_delivery(uuid,jsonb,numeric,text,text,jsonb) rename to standard_complete_delivery;
alter function public.standard_complete_delivery(uuid,jsonb,numeric,text,text,jsonb) set schema private;
revoke all on function private.standard_complete_delivery(uuid,jsonb,numeric,text,text,jsonb) from public,anon,authenticated;
create or replace function public.complete_delivery(p_trip_id uuid,p_lines jsonb,p_actual_freight numeric,p_pod_reference text,p_request_id text,p_expenses jsonb) returns jsonb language plpgsql security definer set search_path=public,private as $$
begin
 perform private.require_role(array['LOGISTICS','ADMIN']);
 if exists(select 1 from delivery_trips where id=p_trip_id and booking_id is not null) then raise exception 'USE_GROUP_COMPLETION'; end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'DELIVERY_LINES_REQUIRED'; end if;
 if (select count(*) from delivery_trip_lines where trip_id=p_trip_id)<>(select count(distinct x->>'trip_line_id') from jsonb_array_elements(p_lines)x) or jsonb_array_length(p_lines)<>(select count(*) from delivery_trip_lines where trip_id=p_trip_id) or exists(select 1 from jsonb_array_elements(p_lines)x where x->>'received_qty' is null) then raise exception 'ALL_DELIVERY_LINES_REQUIRED'; end if;
 return private.standard_complete_delivery(p_trip_id,p_lines,p_actual_freight,p_pod_reference,p_request_id,p_expenses);
end $$;
create or replace function public.complete_delivery(p_trip_id uuid,p_lines jsonb,p_actual_freight numeric,p_pod_reference text,p_request_id text) returns jsonb language sql security invoker set search_path=public as $$ select public.complete_delivery(p_trip_id,p_lines,p_actual_freight,p_pod_reference,p_request_id,'[]'::jsonb) $$;
revoke all on function public.complete_delivery(uuid,jsonb,numeric,text,text,jsonb) from public,anon;
grant execute on function public.complete_delivery(uuid,jsonb,numeric,text,text,jsonb) to authenticated;

create or replace function public.premium_complete_booking(p_booking_id uuid,p_total_freight numeric,p_allocations jsonb) returns jsonb language plpgsql security definer set search_path=public,private as $$
declare ctx record; b record; a jsonb; t record; result jsonb:='[]'; lines jsonb; n integer;
begin
 select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
 select * into b from vehicle_booking_requests where id=p_booking_id and company_id=ctx.company_id for update;
 if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
 if b.completed_at is not null then return jsonb_build_object('id',b.id,'idempotent',true); end if;
 if b.dispatched_at is null or b.status<>'CONFIRMED' then raise exception 'BOOKING_NOT_DISPATCHED'; end if;
 if p_total_freight is null or p_total_freight<0 or p_total_freight<>round(p_total_freight,2) then raise exception 'INVALID_FREIGHT'; end if;
 if p_allocations is null or jsonb_typeof(p_allocations)<>'array' then raise exception 'ALLOCATIONS_REQUIRED'; end if;
 select count(*) into n from delivery_trips where booking_id=b.id and company_id=ctx.company_id;
 if n=0 or jsonb_array_length(p_allocations)<>n or (select count(distinct x->>'trip_id') from jsonb_array_elements(p_allocations)x)<>n then raise exception 'ALL_TRIP_ALLOCATIONS_REQUIRED'; end if;
 if exists(select 1 from jsonb_array_elements(p_allocations)x where x->>'freight' is null or (x->>'freight')::numeric<0 or (x->>'freight')::numeric<>round((x->>'freight')::numeric,2)) then raise exception 'INVALID_FREIGHT'; end if;
 if (select sum((x->>'freight')::numeric) from jsonb_array_elements(p_allocations)x)<>p_total_freight then raise exception 'FREIGHT_ALLOCATION_MISMATCH'; end if;
 for a in select * from jsonb_array_elements(p_allocations) loop
  select * into t from delivery_trips where id=(a->>'trip_id')::uuid and booking_id=b.id and company_id=ctx.company_id for update;
  if not found or t.status='COMPLETED' then raise exception 'INVALID_GROUP_TRIP'; end if;
  lines:=a->'lines';
  if lines is null or jsonb_typeof(lines)<>'array' then raise exception 'ALL_DELIVERY_LINES_REQUIRED'; end if;
  if jsonb_array_length(lines)<>(select count(*) from delivery_trip_lines where trip_id=t.id) or (select count(distinct x->>'trip_line_id') from jsonb_array_elements(lines)x)<>jsonb_array_length(lines) or exists(select 1 from jsonb_array_elements(lines)x where x->>'received_qty' is null) then raise exception 'ALL_DELIVERY_LINES_REQUIRED'; end if;
  result:=result||private.standard_complete_delivery(t.id,lines,(a->>'freight')::numeric,a->>'pod_reference','PC-'||b.id||'-'||t.id,coalesce(a->'expenses','[]'::jsonb));
 end loop;
 update vehicle_booking_requests set completed_at=now(),actual_freight_total=p_total_freight,updated_at=now() where id=b.id;
 insert into audit_logs(company_id,user_id,action,entity_type,entity_id,after_data) values(ctx.company_id,auth.uid(),'PREMIUM_COMPLETE','VEHICLE_BOOKING',b.id::text,jsonb_build_object('freight_total',p_total_freight,'invoices',result));
 return jsonb_build_object('id',b.id,'invoices',result,'idempotent',false);
end $$;
revoke all on function public.premium_complete_booking(uuid,numeric,jsonb) from public,anon;
grant execute on function public.premium_complete_booking(uuid,numeric,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.premium_decide_vehicle_booking(p_booking_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare ctx record; b record;
begin
 select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
 if p_decision not in ('CONFIRMED','REJECTED','REVISION_REQUESTED') then raise exception 'INVALID_DECISION'; end if;
 select * into b from public.vehicle_booking_requests where id=p_booking_id and company_id=ctx.company_id;
 if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
 perform 1 from public.vehicles where id=b.vehicle_id and company_id=ctx.company_id for update;
 select * into b from public.vehicle_booking_requests where id=p_booking_id and company_id=ctx.company_id for update;
 if b.status<>'PENDING' then raise exception 'BOOKING_NOT_PENDING'; end if;
 if p_decision='CONFIRMED' and exists (
 select 1 from public.vehicle_booking_requests x where x.id<>b.id and x.company_id=ctx.company_id and x.vehicle_id=b.vehicle_id and x.status in ('PENDING','CONFIRMED') and x.requested_start<b.requested_end and x.requested_end>b.requested_start
 ) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
 update public.vehicle_booking_requests set status=p_decision,transport_notes=nullif(btrim(p_note),''),decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=b.id;
 insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
 values(ctx.company_id,auth.uid(),'PREMIUM_BOOKING_DECISION','VEHICLE_BOOKING',b.id::text,jsonb_build_object('decision',p_decision,'note',p_note));
 return jsonb_build_object('id',b.id,'booking_no',b.booking_no,'status',p_decision);
end $function$;

CREATE OR REPLACE FUNCTION public.premium_request_vehicle_booking(p_vehicle_id uuid, p_requested_start timestamp with time zone, p_requested_end timestamp with time zone, p_order_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare ctx record; v_id uuid; v_number text; v_order uuid; v_total integer;
begin
 select * into ctx from private.require_role(array['SALES','LOGISTICS','ADMIN']);
 if p_vehicle_id is null or p_requested_start is null or p_requested_end is null or p_requested_end <= p_requested_start then raise exception 'INVALID_BOOKING_WINDOW'; end if;
 if p_requested_start < now() - interval '1 day' then raise exception 'PAST_BOOKING_NOT_ALLOWED'; end if;
 if coalesce(array_length(p_order_ids,1),0)=0 then raise exception 'ORDER_REQUIRED'; end if;
 perform 1 from public.vehicles where id=p_vehicle_id and company_id=ctx.company_id and active for update;
 if not found then raise exception 'VEHICLE_NOT_AVAILABLE'; end if;
 select count(distinct o.id) into v_total from public.orders o where o.id=any(p_order_ids) and o.company_id=ctx.company_id and o.status <> 'CANCELLED';
 if v_total<>coalesce(array_length(p_order_ids,1),0) then raise exception 'INVALID_OR_DUPLICATE_ORDER'; end if;
 if exists(select 1 from public.delivery_trips t where t.company_id=ctx.company_id and t.vehicle_id=p_vehicle_id and t.status not in ('COMPLETED','CANCELLED') and t.planned_start<p_requested_end and t.planned_end>p_requested_start) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
 if exists(select 1 from public.vehicle_booking_requests b where b.company_id=ctx.company_id and b.vehicle_id=p_vehicle_id and b.status in ('PENDING','CONFIRMED') and b.completed_at is null and b.requested_start<p_requested_end and b.requested_end>p_requested_start) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
 if exists(select 1 from public.vehicle_booking_orders bo join public.vehicle_booking_requests b on b.id=bo.booking_id where bo.company_id=ctx.company_id and bo.order_id=any(p_order_ids) and b.status in ('PENDING','CONFIRMED')) then raise exception 'ORDER_ALREADY_BOOKED'; end if;
 v_number:='BK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
 insert into public.vehicle_booking_requests(company_id,booking_no,requested_by,vehicle_id,requested_start,requested_end,notes)
 values(ctx.company_id,v_number,auth.uid(),p_vehicle_id,p_requested_start,p_requested_end,nullif(btrim(p_notes),'')) returning id into v_id;
 insert into public.vehicle_booking_orders(booking_id,order_id,company_id) select v_id,o.id,ctx.company_id from public.orders o where o.id=any(p_order_ids) and o.company_id=ctx.company_id;
 insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
 values(ctx.company_id,auth.uid(),'PREMIUM_BOOKING_REQUESTED','VEHICLE_BOOKING',v_id::text,jsonb_build_object('booking_no',v_number,'order_count',v_total));
 return jsonb_build_object('id',v_id,'booking_no',v_number,'status','PENDING');
end $function$
;
