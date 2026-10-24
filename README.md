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
- Sale-time payments and standalone payments may exceed the amount due. The excess is saved as customer advance and automatically applied to that customer's next sale.
- Customer pending balances are computed as sale dues plus opening balance minus sale-time cash and standalone payments. Any cash beyond the billed total and opening balance is shown as advance credit.
- Opening balances represent previous dues from before this system. They are stored once per customer in `customer_opening_balances`, shown as an Opening Balance ledger entry, and are never counted as sales or new cash collections.
- Advance credit is applied automatically against the next sale, so only the remaining amount is collected. Advance adjustments are internal and are never counted as new cash.
- Customer profiles, the customer directory, sales history, and receipts show how much advance was used or added.
- Daily summary cards use the selected local calendar date for sale totals and cash collected. The quick-sale form supports 500 g packets, 1 kg packets, and bulk sales priced per kilogram.
- The Payments & Due Ledger page supports partial/full/advance payments, payment methods and references, opening balances, customer-wise dues, ledger filters, CSV export, print-friendly ledgers, and editable WhatsApp reminders (Tamil or English).
- Payment and opening-balance changes are recorded in audit tables by database triggers.
- WhatsApp reminders open a prefilled, editable message in WhatsApp; the admin reviews and sends it manually.
- The schema expects a single currency; add currency support before recording transactions in multiple currencies.
