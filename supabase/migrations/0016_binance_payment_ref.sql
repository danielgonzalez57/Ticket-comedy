-- =============================================================
-- 0016 — Binance as a payment method.
--
-- Checkout now collects the payment data up front (Pago Móvil: bank,
-- reference, Bs amount, date; Binance: Binance Pay order ID and an
-- optional Binance email) and reports it right after the order is
-- created, so no order reaches the admin without a reference.
--
-- Pago Móvil references keep the 6-8 digit rule from 0003. A Binance
-- Pay order ID is longer (typically 18-19 digits), so for
-- payment_method = 'binance' allow 6-32 digits. Binance reports store
-- banco_emisor = 'Binance', which keeps the (banco_emisor,
-- payment_ref) uniqueness index from 0003 meaningful for them too.
-- Keep in sync with REF_PATTERNS in lib/payment-report.ts.
-- =============================================================
alter table orders
  drop constraint if exists orders_payment_ref_format;
alter table orders
  add constraint orders_payment_ref_format
  check (
    payment_ref is null
    or payment_ref ~ '^[0-9]{6,8}$'
    or (payment_method = 'binance' and payment_ref ~ '^[0-9]{6,32}$')
  )
  not valid;

-- The customer's Binance account email (optional) — helps the admin
-- find the incoming payment in Binance's history.
alter table orders add column if not exists binance_email text;
