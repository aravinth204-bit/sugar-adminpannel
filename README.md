# Karumbu Ledger

A private sales and customer ledger admin panel for Karumbu Sakkarai (cane sugar), built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase.

## Getting started

1. Install dependencies with `npm install`.
2. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project.
3. Apply all migrations in `supabase/migrations/` to the project using the Supabase CLI (`supabase db push`) or the Supabase SQL Editor.
4. In Supabase Authentication, create an admin user and disable public sign-ups unless your deployment has a deliberate user-provisioning flow. The application provides sign-in only.
5. Run `npm run dev`.

All ledger tables use row-level security and require an authenticated Supabase user. Create only trusted admin accounts: every authenticated user has access to the shared business ledger. The public anon key is intended for the browser; never expose a service-role key.

## Ledger rules

- Sale totals are calculated and rounded to two decimal places in the database from kilograms × price per kilogram.
- Sale-time payments may exceed the amount due. The excess is saved as customer advance and automatically applied to that customer's next sale.
- A standalone payment reduces the customer's aggregate outstanding balance and cannot exceed the current due.
- Customer pending balances are computed as total sale amounts minus sale-time payments and standalone payments.
- Daily summary cards use the selected local calendar date for sale totals and cash collected. The quick-sale form supports 500 g packets, 1 kg packets, and bulk sales priced per kilogram.
- WhatsApp reminders open a prefilled message; the admin reviews and sends it from WhatsApp.
- The schema expects a single currency; add currency support before recording transactions in multiple currencies.
