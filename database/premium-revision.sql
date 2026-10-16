-- Premium spkoqjfpiurtjbfrtcvh only. Existing tables are reused.
create or replace function public.premium_resubmit_vehicle_booking(p_booking_id uuid,p_vehicle_id uuid,p_requested_start timestamptz,p_requested_end timestamptz,p_order_ids uuid[],p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare ctx record;b record;n integer;
begin
 select * into ctx from private.require_role(array['SALES','LOGISTICS','ADMIN']);
 select * into b from vehicle_booking_requests where id=p_booking_id and company_id=ctx.company_id;
 if not found then raise exception 'BOOKING_NOT_FOUND';end if;
 if b.requested_by<>auth.uid() and ctx.app_role<>'ADMIN' then raise exception 'ROLE_NOT_ALLOWED';end if;
 if p_vehicle_id is null or p_requested_start is null or p_requested_end is null or p_requested_end<=p_requested_start then raise exception 'INVALID_BOOKING_WINDOW';end if;
 if p_requested_start<now()-interval '1 day' then raise exception 'PAST_BOOKING_NOT_ALLOWED';end if;
 perform 1 from vehicles where id in(b.vehicle_id,p_vehicle_id) and company_id=ctx.company_id order by id for update;
 if not exists(select 1 from vehicles where id=p_vehicle_id and company_id=ctx.company_id and active) then raise exception 'VEHICLE_NOT_AVAILABLE';end if;
 select * into b from vehicle_booking_requests where id=p_booking_id for update;
 if b.status<>'REVISION_REQUESTED' or b.dispatched_at is not null then raise exception 'BOOKING_NOT_EDITABLE';end if;
 perform 1 from orders where id=any(p_order_ids) and company_id=ctx.company_id order by id for update;
 select count(distinct id) into n from orders where id=any(p_order_ids) and company_id=ctx.company_id and status in ('CONFIRMED','PARTIAL_ISSUE','WAITING_LOGISTICS');
 if n=0 or n<>coalesce(array_length(p_order_ids,1),0) then raise exception 'INVALID_OR_DUPLICATE_ORDER';end if;
 if exists(select 1 from vehicle_booking_requests x where x.id<>b.id and x.company_id=ctx.company_id and x.vehicle_id=p_vehicle_id and x.status in('PENDING','CONFIRMED') and x.completed_at is null and x.requested_start<p_requested_end and x.requested_end>p_requested_start) or exists(select 1 from delivery_trips t where t.company_id=ctx.company_id and t.vehicle_id=p_vehicle_id and t.status not in('COMPLETED','CANCELLED') and t.planned_start<p_requested_end and t.planned_end>p_requested_start) then raise exception 'VEHICLE_TIME_CONFLICT';end if;
 if exists(select 1 from vehicle_booking_orders bo join vehicle_booking_requests x on x.id=bo.booking_id where x.id<>b.id and bo.company_id=ctx.company_id and bo.order_id=any(p_order_ids) and x.status in('PENDING','CONFIRMED') and x.completed_at is null) then raise exception 'ORDER_ALREADY_BOOKED';end if;
 delete from vehicle_booking_orders where booking_id=b.id and company_id=ctx.company_id;
 insert into vehicle_booking_orders(booking_id,order_id,company_id)select b.id,id,ctx.company_id from orders where id=any(p_order_ids) and company_id=ctx.company_id;
 update vehicle_booking_requests set vehicle_id=p_vehicle_id,requested_start=p_requested_start,requested_end=p_requested_end,notes=nullif(btrim(p_notes),''),status='PENDING',decided_by=null,decided_at=null,updated_at=now() where id=b.id;
 insert into audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)values(ctx.company_id,auth.uid(),'PREMIUM_BOOKING_RESUBMITTED','VEHICLE_BOOKING',b.id::text,jsonb_build_object('order_ids',p_order_ids));
 return jsonb_build_object('id',b.id,'booking_no',b.booking_no,'status','PENDING');
end $$;
revoke all on function public.premium_resubmit_vehicle_booking(uuid,uuid,timestamptz,timestamptz,uuid[],text) from public,anon;
grant execute on function public.premium_resubmit_vehicle_booking(uuid,uuid,timestamptz,timestamptz,uuid[],text) to authenticated;

create or replace function public.premium_decide_vehicle_booking(p_booking_id uuid,p_decision text,p_note text default null)returns jsonb language plpgsql security definer set search_path=public,private as $$
declare ctx record;b record;
begin
 select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
 if p_decision not in('CONFIRMED','REJECTED','REVISION_REQUESTED')then raise exception 'INVALID_DECISION';end if;
 if p_decision<>'CONFIRMED' and coalesce(btrim(p_note),'')=''then raise exception 'DECISION_REASON_REQUIRED';end if;
 select * into b from vehicle_booking_requests where id=p_booking_id and company_id=ctx.company_id;
 if not found then raise exception 'BOOKING_NOT_FOUND';end if;
 perform 1 from vehicles where id=b.vehicle_id and company_id=ctx.company_id and active for update;
 if not found then raise exception 'VEHICLE_NOT_AVAILABLE';end if;
 select * into b from vehicle_booking_requests where id=p_booking_id for update;
 if b.status<>'PENDING'then raise exception 'BOOKING_NOT_PENDING';end if;
 if p_decision='CONFIRMED' and (exists(select 1 from vehicle_booking_requests x where x.id<>b.id and x.company_id=ctx.company_id and x.vehicle_id=b.vehicle_id and x.status in('PENDING','CONFIRMED') and x.completed_at is null and x.requested_start<b.requested_end and x.requested_end>b.requested_start)or exists(select 1 from delivery_trips t where t.company_id=ctx.company_id and t.vehicle_id=b.vehicle_id and t.status not in('COMPLETED','CANCELLED') and t.planned_start<b.requested_end and t.planned_end>b.requested_start))then raise exception 'VEHICLE_TIME_CONFLICT';end if;
 update vehicle_booking_requests set status=p_decision,transport_notes=nullif(btrim(p_note),''),decided_by=auth.uid(),decided_at=now(),updated_at=now()where id=b.id;
 insert into audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)values(ctx.company_id,auth.uid(),'PREMIUM_BOOKING_DECISION','VEHICLE_BOOKING',b.id::text,jsonb_build_object('decision',p_decision,'note',p_note));
 return jsonb_build_object('id',b.id,'booking_no',b.booking_no,'status',p_decision);
end $$;
