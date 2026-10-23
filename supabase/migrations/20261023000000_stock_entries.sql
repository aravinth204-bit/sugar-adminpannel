-- Packet stock register.
-- Each row records stock added for a packet size (500g / 1kg) or bulk sugar (kg).
-- Current stock is derived as: sum(stock added) - sum(quantity sold from public.sales).

create table if not exists public.stock_entries (
  id uuid primary key default gen_random_uuid(),
  stock_unit text not null check (stock_unit in ('500g', '1kg', 'bulk')),
  quantity numeric(12, 3) not null check (quantity > 0),
  added_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists stock_entries_added_on_idx
  on public.stock_entries (added_on desc, created_at desc);

alter table public.stock_entries enable row level security;

drop policy if exists "Authenticated users can manage stock entries" on public.stock_entries;
create policy "Authenticated users can manage stock entries"
  on public.stock_entries for all to authenticated
  using (true) with check (true);

grant select, insert on public.stock_entries to authenticated;

notify pgrst, 'reload schema';
