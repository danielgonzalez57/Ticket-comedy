-- =============================================================
-- 0010 — Owner check on report_payment (Fase 3 correction)
--
-- /orders/[id] is reachable by anyone with the order's UUID (no
-- session, no login — this app has no public user accounts). That's
-- an accepted trade-off for *viewing* the order (it's the link we
-- hand the customer after checkout), but reportPayment is a WRITE
-- that burns a bank reference against the order and can push it into
-- needs_review — that must not be doable by anyone who merely has
-- the URL (forwarded, in shared-browser history, in a log).
--
-- Fix: report_payment now requires the customer's own email and
-- checks it against orders.customer_email (case-insensitive) before
-- doing anything else. It's not a secret in the cryptographic sense,
-- but it's a value only the actual customer typed at checkout and
-- that an opportunistic holder of the URL is unlikely to also know.
-- =============================================================
create or replace function report_payment(
  p_order_id uuid,
  p_customer_email text,
  p_banco_emisor text,
  p_payment_ref text,
  p_cedula text,
  p_monto_reportado numeric,
  p_fecha_pago date,
  p_receipt_path text default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_conflict_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if lower(v_order.customer_email) <> lower(btrim(p_customer_email)) then
    raise exception 'OWNER_MISMATCH';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  begin
    update orders
       set banco_emisor = p_banco_emisor,
           payment_ref = p_payment_ref,
           cedula = p_cedula,
           monto_reportado = p_monto_reportado,
           fecha_pago = p_fecha_pago,
           receipt_path = coalesce(p_receipt_path, receipt_path),
           status = 'reported',
           reported_at = now()
     where id = p_order_id
     returning * into v_order;
  exception when unique_violation then
    select id into v_conflict_id
    from orders
    where banco_emisor = p_banco_emisor
      and payment_ref = p_payment_ref
      and needs_review = false
      and status not in ('cancelled', 'rejected', 'expired')
    limit 1;

    update orders
       set banco_emisor = p_banco_emisor,
           payment_ref = p_payment_ref,
           cedula = p_cedula,
           monto_reportado = p_monto_reportado,
           fecha_pago = p_fecha_pago,
           receipt_path = coalesce(p_receipt_path, receipt_path),
           status = 'reported',
           reported_at = now(),
           needs_review = true,
           needs_review_of = v_conflict_id
     where id = p_order_id
     returning * into v_order;
  end;

  return v_order;
end;
$$;
