-- Allow standalone customer payments to exceed the outstanding due.
-- Any excess is kept as customer advance and automatically applied to the
-- customer's next sale by add_sale/update_sale.

create or replace function public.record_old_due_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_date date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_payment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment must be greater than zero';
  end if;
  if round(p_amount, 2) <= 0 then
    raise exception 'Payment must be at least 0.01';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));
  perform 1 from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  -- Deliberately allow more than the current due. The sale functions treat
  -- any cash above the billed total as advance for future purchases.
  insert into public.payments (customer_id, amount, payment_date, notes)
  values (
    p_customer_id, round(p_amount, 2),
    coalesce(p_payment_date, current_date), nullif(trim(p_notes), '')
  )
  returning id into new_payment_id;

  return new_payment_id;
end;
$$;

drop function if exists public.fetch_customers_with_balances();

create function public.fetch_customers_with_balances()
returns table(
  id uuid,
  name text,
  phone text,
  address text,
  created_at timestamptz,
  pending_balance numeric,
  advance_balance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.phone,
    c.address,
    c.created_at,
    greatest(coalesce(s.total_due, 0) - coalesce(p.total_paid, 0), 0)::numeric
      as pending_balance,
    greatest(coalesce(p.total_paid, 0) - coalesce(s.total_due, 0), 0)::numeric
      as advance_balance
  from public.customers c
  left join lateral (
    select sum(sale.total_amount - sale.amount_paid - sale.overpaid_amount) as total_due
    from public.sales sale
    where sale.customer_id = c.id
      and sale.status = 'completed'
  ) s on true
  left join lateral (
    select sum(payment.amount) as total_paid
    from public.payments payment
    where payment.customer_id = c.id
  ) p on true
  order by c.name;
$$;

revoke all on function public.record_old_due_payment(uuid, numeric, date, text)
  from public, anon;
grant execute on function public.record_old_due_payment(uuid, numeric, date, text)
  to authenticated;

revoke all on function public.fetch_customers_with_balances() from public, anon;
grant execute on function public.fetch_customers_with_balances() to authenticated;

notify pgrst, 'reload schema';
