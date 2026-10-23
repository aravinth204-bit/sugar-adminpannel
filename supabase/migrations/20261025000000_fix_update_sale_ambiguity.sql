-- Fix: qualify sales.id in update_sale/cancel_sale lookups.
-- update_sale returns an OUT column named id, so the previous unqualified
-- "where id = p_sale_id" lookup raised: column reference "id" is ambiguous.

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
  if p_rate_per_unit is null or round(p_rate_per_unit, 2) <= 0 then
    raise exception 'Rate per unit must be at least 0.01';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'upi') then
    raise exception 'Payment method must be cash or UPI';
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

  if p_amount_paid is null
    or p_amount_paid < 0
    or round(p_amount_paid, 2) > calculated_total then
    raise exception 'Amount paid must be between zero and the sale total';
  end if;

  return query
  update public.sales as updated
  set sale_unit = p_sale_unit,
      sale_quantity = sale_quantity_value,
      rate_per_unit = rate_value,
      quantity_kg = kilograms,
      unit_price = price_per_kg,
      total_amount = calculated_total,
      amount_paid = round(p_amount_paid, 2),
      balance = calculated_total - round(p_amount_paid, 2),
      discount_amount = discount_value,
      payment_method = p_payment_method,
      sale_date = coalesce(p_sale_date, current_date),
      notes = nullif(trim(p_notes), '')
  where updated.id = p_sale_id
  returning updated.id, updated.total_amount, updated.amount_paid, updated.balance;
end;
$$;

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_customer uuid;
  target_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select sale.customer_id, sale.status into target_customer, target_status
  from public.sales sale
  where sale.id = p_sale_id;
  if not found then
    raise exception 'Sale not found';
  end if;
  if target_status = 'cancelled' then
    raise exception 'This sale is already cancelled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_customer::text, 0));

  update public.sales as sale
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = nullif(trim(p_reason), '')
  where sale.id = p_sale_id;
end;
$$;

revoke all on function public.update_sale(uuid, text, numeric, numeric, numeric, numeric, text, date, text) from public, anon;
grant execute on function public.update_sale(uuid, text, numeric, numeric, numeric, numeric, text, date, text) to authenticated;

revoke all on function public.cancel_sale(uuid, text) from public, anon;
grant execute on function public.cancel_sale(uuid, text) to authenticated;

notify pgrst, 'reload schema';
