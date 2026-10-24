-- Payments & Due Ledger module
-- Adds payment metadata, customer opening balances, audit trails, and
-- opening-balance-aware sale/advance calculations. Existing ledger records are
-- never deleted or rewritten by this migration.

-- ---------------------------------------------------------------------------
-- 1. Payment metadata
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists payment_method text not null default 'cash',
  add column if not exists reference text,
  add column if not exists paid_at timestamptz not null default now();

alter table public.payments
  drop constraint if exists payments_payment_method_check,
  drop constraint if exists payments_amount_positive;

alter table public.payments
  add constraint payments_payment_method_check
    check (payment_method in ('cash', 'upi', 'bank', 'other')),
  add constraint payments_amount_positive check (amount > 0);

create index if not exists payments_paid_at_idx
  on public.payments (payment_date desc, paid_at desc);

-- ---------------------------------------------------------------------------
-- 2. Opening balances (one active opening balance per customer)
-- ---------------------------------------------------------------------------

create table if not exists public.customer_opening_balances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  amount numeric(12, 2) not null check (amount >= 0),
  effective_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_opening_balances enable row level security;

drop policy if exists "Authenticated users can manage opening balances"
  on public.customer_opening_balances;
create policy "Authenticated users can manage opening balances"
  on public.customer_opening_balances for all to authenticated
  using (true) with check (true);

grant select, insert, update on public.customer_opening_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Audit trails
-- ---------------------------------------------------------------------------

create table if not exists public.payment_audit_log (
  id bigint generated always as identity primary key,
  payment_id uuid,
  customer_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  amount numeric(12, 2),
  payment_date date,
  payment_method text,
  reference text,
  notes text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create table if not exists public.opening_balance_audit_log (
  id bigint generated always as identity primary key,
  opening_balance_id uuid,
  customer_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_amount numeric(12, 2),
  new_amount numeric(12, 2),
  effective_date date,
  notes text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.payment_audit_log enable row level security;
alter table public.opening_balance_audit_log enable row level security;

drop policy if exists "Authenticated users can read payment audit"
  on public.payment_audit_log;
create policy "Authenticated users can read payment audit"
  on public.payment_audit_log for select to authenticated using (true);

drop policy if exists "Authenticated users can read opening balance audit"
  on public.opening_balance_audit_log;
create policy "Authenticated users can read opening balance audit"
  on public.opening_balance_audit_log for select to authenticated using (true);

grant select on public.payment_audit_log to authenticated;
grant select on public.opening_balance_audit_log to authenticated;

create or replace function public.audit_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.payment_audit_log (
      payment_id, customer_id, action, amount, payment_date,
      payment_method, reference, notes, changed_by
    ) values (
      old.id, old.customer_id, 'delete', old.amount, old.payment_date,
      old.payment_method, old.reference, old.notes, auth.uid()
    );
    return old;
  end if;

  insert into public.payment_audit_log (
    payment_id, customer_id, action, amount, payment_date,
    payment_method, reference, notes, changed_by
  ) values (
    new.id, new.customer_id, lower(tg_op), new.amount, new.payment_date,
    new.payment_method, new.reference, new.notes, auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists payments_audit_trigger on public.payments;
create trigger payments_audit_trigger
  after insert or update or delete on public.payments
  for each row execute function public.audit_payment_change();

create or replace function public.audit_opening_balance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.opening_balance_audit_log (
      opening_balance_id, customer_id, action, old_amount, new_amount,
      effective_date, notes, changed_by
    ) values (
      old.id, old.customer_id, 'delete', old.amount, null,
      old.effective_date, old.notes, auth.uid()
    );
    return old;
  end if;

  insert into public.opening_balance_audit_log (
    opening_balance_id, customer_id, action, old_amount, new_amount,
    effective_date, notes, changed_by
  ) values (
    new.id,
    new.customer_id,
    lower(tg_op),
    case when tg_op = 'UPDATE' then old.amount else null end,
    new.amount,
    new.effective_date,
    new.notes,
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists opening_balance_audit_trigger
  on public.customer_opening_balances;
create trigger opening_balance_audit_trigger
  after insert or update or delete on public.customer_opening_balances
  for each row execute function public.audit_opening_balance_change();

-- ---------------------------------------------------------------------------
-- 4. Payment / opening balance write functions
-- ---------------------------------------------------------------------------

create or replace function public.record_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_date date default current_date,
  p_notes text default null,
  p_payment_method text default 'cash',
  p_reference text default null,
  p_paid_at timestamptz default now()
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
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'Payment must be at least 0.01';
  end if;
  if p_payment_method is null
    or p_payment_method not in ('cash', 'upi', 'bank', 'other') then
    raise exception 'Payment method must be cash, UPI, bank transfer, or other';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));
  perform 1 from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  insert into public.payments (
    customer_id, amount, payment_date, notes, payment_method, reference, paid_at
  ) values (
    p_customer_id,
    round(p_amount, 2),
    coalesce(p_payment_date, current_date),
    nullif(trim(p_notes), ''),
    p_payment_method,
    nullif(trim(p_reference), ''),
    coalesce(p_paid_at, now())
  )
  returning id into new_payment_id;

  return new_payment_id;
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
begin
  return public.record_customer_payment(
    p_customer_id, p_amount, p_payment_date, p_notes, 'cash', null, now()
  );
end;
$$;

create or replace function public.set_customer_opening_balance(
  p_customer_id uuid,
  p_amount numeric,
  p_effective_date date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  opening_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_amount is null or round(p_amount, 2) < 0 then
    raise exception 'Opening balance cannot be negative';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));
  perform 1 from public.customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  insert into public.customer_opening_balances as opening (
    customer_id, amount, effective_date, notes
  ) values (
    p_customer_id,
    round(p_amount, 2),
    coalesce(p_effective_date, current_date),
    nullif(trim(p_notes), '')
  )
  on conflict (customer_id) do update set
    amount = excluded.amount,
    effective_date = excluded.effective_date,
    notes = excluded.notes,
    updated_at = now()
  returning opening.id into opening_id;

  return opening_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Opening-balance-aware customer balances
-- ---------------------------------------------------------------------------

drop function if exists public.fetch_customers_with_balances();

create function public.fetch_customers_with_balances()
returns table(
  id uuid,
  name text,
  phone text,
  address text,
  created_at timestamptz,
  pending_balance numeric,
  advance_balance numeric,
  opening_balance numeric
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
    greatest(
      coalesce(s.total_due, 0)
        + coalesce(o.amount, 0)
        - coalesce(p.total_paid, 0),
      0
    )::numeric as pending_balance,
    greatest(
      coalesce(p.total_paid, 0)
        - coalesce(s.total_due, 0)
        - coalesce(o.amount, 0),
      0
    )::numeric as advance_balance,
    coalesce(o.amount, 0)::numeric as opening_balance
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
  left join public.customer_opening_balances o on o.customer_id = c.id
  order by c.name;
$$;

-- ---------------------------------------------------------------------------
-- 6. Sale functions account for opening dues without treating them as sales
-- ---------------------------------------------------------------------------

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
  opening_total numeric(12, 2);
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

  select coalesce(amount, 0)
  into opening_total
  from public.customer_opening_balances
  where customer_id = p_customer_id;

  billed_total := billed_total + coalesce(opening_total, 0);
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
  opening_total numeric(12, 2);
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

  select coalesce(amount, 0)
  into opening_total
  from public.customer_opening_balances
  where customer_id = target_customer;

  billed_total := billed_total + coalesce(opening_total, 0);
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

-- ---------------------------------------------------------------------------
-- 7. Permissions
-- ---------------------------------------------------------------------------

revoke all on function public.record_customer_payment(uuid, numeric, date, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.record_customer_payment(uuid, numeric, date, text, text, text, timestamptz)
  to authenticated;

revoke all on function public.record_old_due_payment(uuid, numeric, date, text)
  from public, anon;
grant execute on function public.record_old_due_payment(uuid, numeric, date, text)
  to authenticated;

revoke all on function public.set_customer_opening_balance(uuid, numeric, date, text)
  from public, anon;
grant execute on function public.set_customer_opening_balance(uuid, numeric, date, text)
  to authenticated;

revoke all on function public.add_sale(uuid, text, numeric, numeric, numeric, date, text, numeric, text)
  from public, anon;
grant execute on function public.add_sale(uuid, text, numeric, numeric, numeric, date, text, numeric, text)
  to authenticated;

revoke all on function public.update_sale(uuid, text, numeric, numeric, numeric, numeric, text, date, text)
  from public, anon;
grant execute on function public.update_sale(uuid, text, numeric, numeric, numeric, numeric, text, date, text)
  to authenticated;

revoke all on function public.fetch_customers_with_balances() from public, anon;
grant execute on function public.fetch_customers_with_balances() to authenticated;

notify pgrst, 'reload schema';
