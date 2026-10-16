-- Premium only: match the existing request and resubmission UI statuses.
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
 perform 1 from public.orders where id=any(p_order_ids) and company_id=ctx.company_id order by id for update;
 select count(distinct o.id) into v_total from public.orders o where o.id=any(p_order_ids) and o.company_id=ctx.company_id and o.status in ('CONFIRMED','PARTIAL_ISSUE','WAITING_LOGISTICS');
 if v_total<>coalesce(array_length(p_order_ids,1),0) then raise exception 'INVALID_OR_DUPLICATE_ORDER'; end if;
 if exists(select 1 from public.delivery_trips t where t.company_id=ctx.company_id and t.vehicle_id=p_vehicle_id and t.status not in ('COMPLETED','CANCELLED') and t.planned_start<p_requested_end and t.planned_end>p_requested_start) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
 if exists(select 1 from public.vehicle_booking_requests b where b.company_id=ctx.company_id and b.vehicle_id=p_vehicle_id and b.status in ('PENDING','CONFIRMED') and b.completed_at is null and b.requested_start<p_requested_end and b.requested_end>p_requested_start) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
 if exists(select 1 from public.vehicle_booking_orders bo join public.vehicle_booking_requests b on b.id=bo.booking_id where bo.company_id=ctx.company_id and bo.order_id=any(p_order_ids) and b.status in ('PENDING','CONFIRMED') and b.completed_at is null) then raise exception 'ORDER_ALREADY_BOOKED'; end if;
 v_number:='BK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
 insert into public.vehicle_booking_requests(company_id,booking_no,requested_by,vehicle_id,requested_start,requested_end,notes)
 values(ctx.company_id,v_number,auth.uid(),p_vehicle_id,p_requested_start,p_requested_end,nullif(btrim(p_notes),'')) returning id into v_id;
 insert into public.vehicle_booking_orders(booking_id,order_id,company_id) select v_id,o.id,ctx.company_id from public.orders o where o.id=any(p_order_ids) and o.company_id=ctx.company_id;
 insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
 values(ctx.company_id,auth.uid(),'PREMIUM_BOOKING_REQUESTED','VEHICLE_BOOKING',v_id::text,jsonb_build_object('booking_no',v_number,'order_count',v_total));
 return jsonb_build_object('id',v_id,'booking_no',v_number,'status','PENDING');
end $function$
;

revoke execute on function public.premium_request_vehicle_booking(uuid,timestamptz,timestamptz,uuid[],text) from public,anon;
grant execute on function public.premium_request_vehicle_booking(uuid,timestamptz,timestamptz,uuid[],text) to authenticated;
