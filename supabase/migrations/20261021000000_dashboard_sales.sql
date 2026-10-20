alter table public.sales
  add column if not exists sale_unit text not null default 'bulk'
    check (sale_unit in ('500g', '1kg', 'bulk')),
  add column if not exists sale_quantity numeric(12, 3),
  add column if not exists rate_per_unit numeric(12, 2);

update public.sales
set sale_unit = coalesce(sale_unit, 'bulk'),
    sale_quantity = coalesce(sale_quantity, quantity_kg),
    rate_per_unit = coalesce(rate_per_unit, unit_price);

alter table public.sales
  alter column sale_unit set default 'bulk',
  alter column sale_unit set not null,
  alter column sale_quantity set not null,
  alter column rate_per_unit set not null;

alter table public.sales
  drop constraint if exists sales_sale_unit_check,
  drop constraint if exists sales_package_quantity_positive,
  drop constraint if exists sales_rate_nonnegative,
  add constraint sales_sale_unit_check check (sale_unit in ('500g', '1kg', 'bulk')),
  add constraint sales_package_quantity_positive check (sale_quantity > 0),
  add constraint sales_rate_nonnegative check (rate_per_unit >= 0);

drop function if exists public.add_sale(uuid, numeric, numeric, numeric, date, text);

create function public.add_sale(
  p_customer_id uuid,
  p_sale_unit text,
  p_quantity numeric,
  p_rate_per_unit numeric,
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
  package_weight numeric(12, 3);
  kilograms numeric(12, 3);
  price_per_kg numeric(12, 2);
  calculated_total numeric(12, 2);
  sale_quantity_value numeric(12, 3);
  rate_value numeric(12, 2);
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

  package_weight := case p_sale_unit
    when '500g' then 0.5
    when '1kg' then 1
    else 1
  end;
  sale_quantity_value := round(p_quantity, 3);
  rate_value := round(p_rate_per_unit, 2);
  kilograms := round(sale_quantity_value * package_weight, 3);
  price_per_kg := round(rate_value / package_weight, 2);
  calculated_total := round(sale_quantity_value * rate_value, 2);

  if p_amount_paid is null
    or p_amount_paid < 0
    or round(p_amount_paid, 2) > calculated_total then
    raise exception 'Amount paid must be between zero and the sale total';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  return query
  insert into public.sales as inserted (
    customer_id, quantity_kg, unit_price, total_amount, amount_paid, balance,
    sale_date, notes, sale_unit, sale_quantity, rate_per_unit
  )
  values (
    p_customer_id, kilograms, price_per_kg, calculated_total,
    round(p_amount_paid, 2), calculated_total - round(p_amount_paid, 2),
    coalesce(p_sale_date, current_date), nullif(trim(p_notes), ''),
    p_sale_unit, sale_quantity_value, rate_value
  )
  returning inserted.id, inserted.total_amount, inserted.amount_paid, inserted.balance;
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
    ), 0)::numeric,
    (
      coalesce((
        select sum(sale.amount_paid)
        from public.sales sale
        where sale.sale_date = p_sale_date
      ), 0)
      +
      coalesce((
        select sum(payment.amount)
        from public.payments payment
        where payment.payment_date = p_sale_date
      ), 0)
    )::numeric;
$$;

revoke all on function public.add_sale(uuid, text, numeric, numeric, numeric, date, text)
  from public, anon;
grant execute on function public.add_sale(uuid, text, numeric, numeric, numeric, date, text)
  to authenticated;
revoke all on function public.fetch_dashboard_stats(date) from public, anon;
grant execute on function public.fetch_dashboard_stats(date) to authenticated;

notify pgrst, 'reload schema';
