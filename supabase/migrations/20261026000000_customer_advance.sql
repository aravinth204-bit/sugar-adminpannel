-- Save sale overpayments as customer advance and apply advance to later sales.
-- amount_paid is the cash applied to this sale after available credit.
-- overpaid_amount is new cash kept as advance; credit_applied is old advance used.

alter table public.sales
  add column if not exists overpaid_amount numeric(12, 2) not null default 0,
  add column if not exists credit_applied numeric(12, 2) not null default 0;

alter table public.sales
  drop constraint if exists sales_balance_check,
  drop constraint if exists sales_amounts_consistent,
  drop constraint if exists sales_overpaid_nonnegative,
  drop constraint if exists sales_credit_applied_nonnegative;

alter table public.sales
  add constraint sales_overpaid_nonnegative check (overpaid_amount >= 0),
  add constraint sales_credit_applied_nonnegative check (credit_applied >= 0),
  add constraint sales_amounts_consistent check (
    amount_paid >= 0
    and overpaid_amount >= 0
    and credit_applied >= 0
    and total_amount >= 0
    and amount_paid + credit_applied <= total_amount
    and balance = total_amount - amount_paid - credit_applied
    and balance >= 0
  );

create or replace function public.fetch_customers_with_balances()
returns table(
  id uuid,
  name text,
  phone text,
  address text,
  created_at timestamptz,
  pending_balance numeric
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

create or replace function public.add_sale(
  p_customer_id uuid,
  p_sale_unit text,
  p_quantity numeric,
  p_rate_per_unit numeric,
  p_amount_paid numeric default 0,
  p_sale_date date default current_date,
  p_notes text default null,
  p_discount numeric default 0,
  p_payment_method text default 'cash'
)
returns table(id uuid, total_amount numeric, amount_paid numeric, balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  package_weight numeric(12, 3);
  kilograms numeric(12, 3);
  price_per_kg numeric(12, 2);
  sale_quantity_value numeric(12, 3);
  rate_value numeric(12, 2);
  gross_total numeric(12, 2);
  discount_value numeric(12, 2);
  calculated_total numeric(12, 2);
  billed_total numeric(12, 2);
  cash_total numeric(12, 2);
  payments_total numeric(12, 2);
  available_advance numeric(12, 2);
  credit_value numeric(12, 2);
  remaining_total numeric(12, 2);
  cash_received numeric(12, 2);
  amount_paid_value numeric(12, 2);
  overpaid_value numeric(12, 2);
  balance_value numeric(12, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_sale_unit is null or p_sale_unit not in ('500g', '1kg', 'bulk') then
    raise exception 'Select 500g, 1kg, or bulk';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_sale_unit <> 'bulk' and p_quantity <> trunc(p_quantity) then
    raise exception 'Packet quantity must be a whole number';
  end if;
  if round(p_quantity, 3) <= 0 then
    raise exception 'Quantity must be at least 0.001';
  end if;
  if p_rate_per_unit is null or p_rate_per_unit < 0 then
    raise exception 'Rate per unit cannot be negative';
  end if;
  if round(p_rate_per_unit, 2) <= 0 then
    raise exception 'Rate per unit must be at least 0.01';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'upi') then
    raise exception 'Payment method must be cash or UPI';
  end if;
  if p_amount_paid is not null and round(p_amount_paid, 2) < 0 then
    raise exception 'Amount paid cannot be negative';
  end if;

  package_weight := case p_sale_unit
    when '500g' then 0.5
    when '1kg' then 1
    else 1
  end;
  sale_quantity_value := round(p_quantity, 3);
  rate_value := round(p_rate_per_unit, 2);
  kilograms := round(sale_quantity_value * package_weight, 3);
  price_per_kg := round(rate_value / package_weight, 2);
  gross_total := round(sale_quantity_value * rate_value, 2);
  discount_value := round(coalesce(p_discount, 0), 2);

  if discount_value < 0 or discount_value > gross_total then
    raise exception 'Discount must be between zero and the bill total';
  end if;
  calculated_total := gross_total - discount_value;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  select
    coalesce(sum(sale.total_amount), 0),
    coalesce(sum(sale.amount_paid + sale.overpaid_amount), 0)
  into billed_total, cash_total
  from public.sales sale
  where sale.customer_id = p_customer_id
    and sale.status = 'completed';

  select coalesce(sum(payment.amount), 0)
  into payments_total
  from public.payments payment
  where payment.customer_id = p_customer_id;

  available_advance := greatest(cash_total + payments_total - billed_total, 0);
  credit_value := least(available_advance, calculated_total);
  remaining_total := calculated_total - credit_value;
  cash_received := round(coalesce(p_amount_paid, 0), 2);

  if cash_received >= remaining_total then
    amount_paid_value := remaining_total;
    overpaid_value := cash_received - remaining_total;
    balance_value := 0;
  else
    amount_paid_value := cash_received;
    overpaid_value := 0;
    balance_value := remaining_total - cash_received;
  end if;

  return query
  insert into public.sales as inserted (
    customer_id, quantity_kg, unit_price, total_amount, amount_paid, balance,
    overpaid_amount, credit_applied,
    sale_date, notes, sale_unit, sale_quantity, rate_per_unit,
    discount_amount, payment_method, status
  )
  values (
    p_customer_id, kilograms, price_per_kg, calculated_total,
    amount_paid_value, balance_value,
    overpaid_value, credit_value,
    coalesce(p_sale_date, current_date), nullif(trim(p_notes), ''),
    p_sale_unit, sale_quantity_value, rate_value,
    discount_value, p_payment_method, 'completed'
  )
  returning inserted.id, inserted.total_amount, inserted.amount_paid, inserted.balance;
end;
$$;

create or replace function public.update_sale(
  p_sale_id uuid,
  p_sale_unit text,
  p_quantity numeric,
  p_rate_per_unit numeric,
  p_amount_paid numeric default 0,
  p_discount numeric default 0,
  p_payment_method text default 'cash',
  p_sale_date date default current_date,
  p_notes text default null
)
returns table(id uuid, total_amount numeric, amount_paid numeric, balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  package_weight numeric(12, 3);
  kilograms numeric(12, 3);
  price_per_kg numeric(12, 2);
  sale_quantity_value numeric(12, 3);
  rate_value numeric(12, 2);
  gross_total numeric(12, 2);
  discount_value numeric(12, 2);
  calculated_total numeric(12, 2);
  target_customer uuid;
  target_status text;
  billed_total numeric(12, 2);
  cash_total numeric(12, 2);
  payments_total numeric(12, 2);
  available_advance numeric(12, 2);
  credit_value numeric(12, 2);
  remaining_total numeric(12, 2);
  cash_received numeric(12, 2);
  amount_paid_value numeric(12, 2);
  overpaid_value numeric(12, 2);
  balance_value numeric(12, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_sale_unit is null or p_sale_unit not in ('500g', '1kg', 'bulk') then
    raise exception 'Select 500g, 1kg, or bulk';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_sale_unit <> 'bulk' and p_quantity <> trunc(p_quantity) then
    raise exception 'Packet quantity must be a whole number';
  end if;
  if round(p_quantity, 3) <= 0 then
    raise exception 'Quantity must be at least 0.001';
  end if;
  if p_rate_per_unit is null or round(p_rate_per_unit, 2) <= 0 then
    raise exception 'Rate per unit must be at least 0.01';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'upi') then
    raise exception 'Payment method must be cash or UPI';
  end if;
  if p_amount_paid is not null and round(p_amount_paid, 2) < 0 then
    raise exception 'Amount paid cannot be negative';
  end if;

  select sale.customer_id, sale.status into target_customer, target_status
  from public.sales sale
  where sale.id = p_sale_id;
  if not found then
    raise exception 'Sale not found';
  end if;
  if target_status = 'cancelled' then
    raise exception 'Cancelled sales cannot be edited';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_customer::text, 0));

  package_weight := case p_sale_unit
    when '500g' then 0.5
    when '1kg' then 1
    else 1
  end;
  sale_quantity_value := round(p_quantity, 3);
  rate_value := round(p_rate_per_unit, 2);
  kilograms := round(sale_quantity_value * package_weight, 3);
  price_per_kg := round(rate_value / package_weight, 2);
  gross_total := round(sale_quantity_value * rate_value, 2);
  discount_value := round(coalesce(p_discount, 0), 2);

  if discount_value < 0 or discount_value > gross_total then
    raise exception 'Discount must be between zero and the bill total';
  end if;
  calculated_total := gross_total - discount_value;

  select
    coalesce(sum(sale.total_amount), 0),
    coalesce(sum(sale.amount_paid + sale.overpaid_amount), 0)
  into billed_total, cash_total
  from public.sales sale
  where sale.customer_id = target_customer
    and sale.status = 'completed'
    and sale.id <> p_sale_id;

  select coalesce(sum(payment.amount), 0)
  into payments_total
  from public.payments payment
  where payment.customer_id = target_customer;

  available_advance := greatest(cash_total + payments_total - billed_total, 0);
  credit_value := least(available_advance, calculated_total);
  remaining_total := calculated_total - credit_value;
  cash_received := round(coalesce(p_amount_paid, 0), 2);

  if cash_received >= remaining_total then
    amount_paid_value := remaining_total;
    overpaid_value := cash_received - remaining_total;
    balance_value := 0;
  else
    amount_paid_value := cash_received;
    overpaid_value := 0;
    balance_value := remaining_total - cash_received;
  end if;

  return query
  update public.sales as updated
  set sale_unit = p_sale_unit,
      sale_quantity = sale_quantity_value,
      rate_per_unit = rate_value,
      quantity_kg = kilograms,
      unit_price = price_per_kg,
      total_amount = calculated_total,
      amount_paid = amount_paid_value,
      balance = balance_value,
      overpaid_amount = overpaid_value,
      credit_applied = credit_value,
      discount_amount = discount_value,
      payment_method = p_payment_method,
      sale_date = coalesce(p_sale_date, current_date),
      notes = nullif(trim(p_notes), '')
  where updated.id = p_sale_id
  returning updated.id, updated.total_amount, updated.amount_paid, updated.balance;
end;
$$;

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
  current_due numeric(12, 2);
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

  select coalesce(sum(total_amount - amount_paid - overpaid_amount), 0)
    - coalesce((select sum(amount) from public.payments where customer_id = p_customer_id), 0)
  into current_due
  from public.sales
  where customer_id = p_customer_id
    and status = 'completed';

  if round(p_amount, 2) > greatest(current_due, 0) then
    raise exception 'Payment exceeds the customer pending balance';
  end if;

  insert into public.payments (customer_id, amount, payment_date, notes)
  values (
    p_customer_id, round(p_amount, 2),
    coalesce(p_payment_date, current_date), nullif(trim(p_notes), '')
  )
  returning id into new_payment_id;

  return new_payment_id;
end;
$$;

create or replace function public.fetch_dashboard_stats(p_sale_date date)
returns table(todays_sale numeric, todays_cash_collected numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce((
      select sum(sale.total_amount)
      from public.sales sale
      where sale.sale_date = p_sale_date
        and sale.status = 'completed'
    ), 0)::numeric,
    (
      coalesce((
        select sum(sale.amount_paid + sale.overpaid_amount)
        from public.sales sale
        where sale.sale_date = p_sale_date
          and sale.status = 'completed'
      ), 0)
      +
      coalesce((
        select sum(payment.amount)
        from public.payments payment
        where payment.payment_date = p_sale_date
      ), 0)
    )::numeric;
$$;

revoke all on function public.add_sale(uuid, text, numeric, numeric, numeric, date, text, numeric, text)
  from public, anon;
grant execute on function public.add_sale(uuid, text, numeric, numeric, numeric, date, text, numeric, text)
  to authenticated;

revoke all on function public.update_sale(uuid, text, numeric, numeric, numeric, numeric, text, date, text)
  from public, anon;
grant execute on function public.update_sale(uuid, text, numeric, numeric, numeric, numeric, text, date, text)
  to authenticated;

revoke all on function public.record_old_due_payment(uuid, numeric, date, text)
  from public, anon;
grant execute on function public.record_old_due_payment(uuid, numeric, date, text)
  to authenticated;

revoke all on function public.fetch_dashboard_stats(date) from public, anon;
grant execute on function public.fetch_dashboard_stats(date) to authenticated;

revoke all on function public.fetch_customers_with_balances() from public, anon;
grant execute on function public.fetch_customers_with_balances() to authenticated;

notify pgrst, 'reload schema';
