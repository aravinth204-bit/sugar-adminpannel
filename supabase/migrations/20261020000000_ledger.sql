create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create unique index if not exists customers_phone_unique
  on public.customers (phone)
  where phone is not null and length(trim(phone)) > 0;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_date date not null default current_date,
  quantity_kg numeric(12, 3) not null check (quantity_kg > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  balance numeric(12, 2) not null check (balance >= 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint sales_amounts_consistent
    check (
      total_amount = round(quantity_kg * unit_price, 2)
      and balance = total_amount - amount_paid
      and amount_paid <= total_amount
    )
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists sales_customer_date_idx
  on public.sales (customer_id, sale_date desc, created_at desc);
create index if not exists payments_customer_date_idx
  on public.payments (customer_id, payment_date desc, created_at desc);

alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;

drop policy if exists "Authenticated users can manage customers" on public.customers;
create policy "Authenticated users can manage customers"
  on public.customers for all to authenticated
  using (true) with check (true);
drop policy if exists "Authenticated users can manage sales" on public.sales;
create policy "Authenticated users can manage sales"
  on public.sales for all to authenticated
  using (true) with check (true);
drop policy if exists "Authenticated users can manage payments" on public.payments;
create policy "Authenticated users can manage payments"
  on public.payments for all to authenticated
  using (true) with check (true);

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
    select sum(sale.total_amount - sale.amount_paid) as total_due
    from public.sales sale
    where sale.customer_id = c.id
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
  p_quantity_kg numeric,
  p_unit_price numeric,
  p_amount_paid numeric default 0,
  p_sale_date date default current_date,
  p_notes text default null
)
returns table(id uuid, total_amount numeric, amount_paid numeric, balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  calculated_total numeric(12, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Price per kilogram cannot be negative';
  end if;

  if round(p_quantity_kg, 3) <= 0 then
    raise exception 'Quantity must be at least 0.001 kg';
  end if;

  calculated_total := round(round(p_quantity_kg, 3) * round(p_unit_price, 2), 2);
  if p_amount_paid is null
    or p_amount_paid < 0
    or round(p_amount_paid, 2) > calculated_total then
    raise exception 'Amount paid must be between zero and the sale total';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  return query
  insert into public.sales as inserted (
    customer_id, quantity_kg, unit_price, total_amount, amount_paid, balance, sale_date, notes
  )
  values (
    p_customer_id, round(p_quantity_kg, 3), round(p_unit_price, 2), calculated_total,
    round(p_amount_paid, 2), calculated_total - round(p_amount_paid, 2),
    coalesce(p_sale_date, current_date), nullif(trim(p_notes), '')
  )
  returning inserted.id, inserted.total_amount, inserted.amount_paid, inserted.balance;
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

  select coalesce(sum(total_amount - amount_paid), 0)
    - coalesce((select sum(amount) from public.payments where customer_id = p_customer_id), 0)
  into current_due
  from public.sales
  where customer_id = p_customer_id;

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

revoke all on function public.add_sale(uuid, numeric, numeric, numeric, date, text) from public, anon;
grant execute on function public.add_sale(uuid, numeric, numeric, numeric, date, text) to authenticated;
revoke all on function public.record_old_due_payment(uuid, numeric, date, text) from public, anon;
grant execute on function public.record_old_due_payment(uuid, numeric, date, text) to authenticated;
revoke all on function public.fetch_customers_with_balances() from public, anon;
grant execute on function public.fetch_customers_with_balances() to authenticated;

grant usage on schema public to authenticated;
grant select, insert on public.customers to authenticated;
grant select on public.sales to authenticated;
grant select on public.payments to authenticated;

notify pgrst, 'reload schema';
