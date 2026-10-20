import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"] & {
  total_billed: number | null;
  total_paid: number | null;
  pending_balance: number | null;
};

export type DailyTotals = {
  sales: number | null;
  collection: number | null;
};

export type RecentSale = {
  id: string;
  customer_id: string;
  sale_date: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  created_at: string;
};

export type CustomerSummaryResult = {
  customers: Customer[];
  totalCustomers: number | null;
  totalBilled: number | null;
  totalPaid: number | null;
  outstanding: number | null;
  dailyTotals: Record<string, DailyTotals>;
  recentSales: RecentSale[];
  salesAvailable: boolean;
  salesComplete: boolean;
  paymentsAvailable: boolean;
  paymentsComplete: boolean;
  customersComplete: boolean;
  warning: string | null;
};

export type LedgerEntry =
  | {
      id: string;
      kind: "sale";
      date: string;
      description: string;
      quantity_kg: number;
      unit_price: number;
      sale_unit: "500g" | "1kg" | "bulk";
      sale_quantity: number;
      rate_per_unit: number;
      debit: number;
      credit: number;
      balance: number;
      created_at: string;
    }
  | {
      id: string;
      kind: "payment";
      date: string;
      description: string;
      quantity_kg: null;
      unit_price: null;
      sale_unit: null;
      sale_quantity: null;
      rate_per_unit: null;
      debit: number;
      credit: number;
      balance: number;
      created_at: string;
    };

export type DashboardStats = {
  todaysSale: number;
  todaysCashCollected: number;
};

type SalesSummaryRow = Pick<
  Database["public"]["Tables"]["sales"]["Row"],
  | "id"
  | "customer_id"
  | "sale_date"
  | "total_amount"
  | "amount_paid"
  | "balance"
  | "created_at"
>;
type PaymentSummaryRow = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  "customer_id" | "payment_date" | "amount" | "id"
>;

const QUERY_PAGE_SIZE = 500;
const MAX_DASHBOARD_ROWS = 10_000;

type QueryError = {
  code?: string;
  message: string;
};

class SupabaseQueryError extends Error {
  constructor(readonly code: string | undefined, message: string) {
    super(message);
    this.name = "SupabaseQueryError";
  }
}

type PagedRows<T> = {
  rows: T[];
  complete: boolean;
};

async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{
    data: T[] | null;
    error: QueryError | null;
    count: number | null;
  }>,
): Promise<PagedRows<T>> {
  const rows: T[] = [];
  let expectedCount: number | null = null;
  let from = 0;

  while (rows.length < MAX_DASHBOARD_ROWS) {
    const pageSize = Math.min(QUERY_PAGE_SIZE, MAX_DASHBOARD_ROWS - rows.length);
    const { data, error, count } = await fetchPage(
      from,
      from + pageSize - 1,
    );
    if (error) throw new SupabaseQueryError(error.code, error.message);
    if (!data) throw new Error("Supabase returned no data for a dashboard query.");

    if (from === 0) {
      expectedCount = count;
      rows.push(...data);
      from = data.length;
      if (expectedCount === null) return { rows, complete: false };
      if (rows.length >= expectedCount) return { rows, complete: true };
      if (data.length === 0) return { rows, complete: false };
      continue;
    }

    rows.push(...data);
    from += data.length;
    if (expectedCount !== null && rows.length >= expectedCount) {
      return { rows, complete: true };
    }
    if (data.length === 0) return { rows, complete: false };
  }

  return { rows, complete: expectedCount !== null && rows.length >= expectedCount };
}

let client: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].filter(Boolean);
    throw new Error(
      `Supabase is not configured. Set ${missing.join(" and ")} in .env.local.`,
    );
  }

  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

export async function fetchCustomers(): Promise<Customer[]> {
  return (await fetchCustomersWithTotals()).customers;
}

export function getBusinessDate(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export async function fetchCustomersWithTotals(): Promise<CustomerSummaryResult> {
  const supabase = getSupabaseClient();
  const customersResult = await fetchAllPages<
    Database["public"]["Tables"]["customers"]["Row"]
  >(async (from, to) =>
    await supabase
      .from("customers")
      .select("id, name, phone, address, created_at", {
        count: from === 0 ? "exact" : undefined,
      })
      .order("name")
      .order("id")
      .range(from, to),
  );

  const [salesResult, paymentsResult] = await Promise.all([
    fetchAllPages<SalesSummaryRow>(async (from, to) =>
      await supabase
        .from("sales")
        .select(
          "id, customer_id, sale_date, total_amount, amount_paid, balance, created_at",
          { count: from === 0 ? "exact" : undefined },
        )
        .order("sale_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ).catch((error: unknown) => handleMissingLedgerTable<SalesSummaryRow>(error)),
    fetchAllPages<PaymentSummaryRow>(async (from, to) =>
      await supabase
        .from("payments")
        .select("customer_id, payment_date, amount, id", {
          count: from === 0 ? "exact" : undefined,
        })
        .order("payment_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ).catch((error: unknown) =>
      handleMissingLedgerTable<PaymentSummaryRow>(error),
    ),
  ]);

  const salesAvailable = salesResult !== null;
  const paymentsAvailable = paymentsResult !== null;
  const salesComplete = salesResult?.complete ?? false;
  const paymentsComplete = paymentsResult?.complete ?? false;
  const customersComplete = customersResult.complete;
  const sales = salesResult?.rows ?? [];
  const payments = paymentsResult?.rows ?? [];
  const canUseSales = salesAvailable && salesComplete;
  const canUsePayments = paymentsAvailable && paymentsComplete;
  const canCalculateCollected = canUseSales && canUsePayments;
  const totalsByCustomer = new Map<
    string,
    { billedCents: number; paidCents: number }
  >();
  const dailyTotalsCents = new Map<
    string,
    { salesCents: number; collectionCents: number }
  >();

  if (canUseSales) {
    for (const sale of sales) {
      const billedCents = toCents(Number(sale.total_amount));
      const salePaidCents = toCents(Number(sale.amount_paid));
      const totals = totalsByCustomer.get(sale.customer_id) ?? {
        billedCents: 0,
        paidCents: 0,
      };
      totals.billedCents += billedCents;
      totals.paidCents += salePaidCents;
      totalsByCustomer.set(sale.customer_id, totals);

      const daily = dailyTotalsCents.get(sale.sale_date) ?? {
        salesCents: 0,
        collectionCents: 0,
      };
      daily.salesCents += billedCents;
      daily.collectionCents += salePaidCents;
      dailyTotalsCents.set(sale.sale_date, daily);
    }
  }
  if (canCalculateCollected) {
    for (const payment of payments) {
      const paidCents = toCents(Number(payment.amount));
      const totals = totalsByCustomer.get(payment.customer_id) ?? {
        billedCents: 0,
        paidCents: 0,
      };
      totals.paidCents += paidCents;
      totalsByCustomer.set(payment.customer_id, totals);

      const daily = dailyTotalsCents.get(payment.payment_date) ?? {
        salesCents: 0,
        collectionCents: 0,
      };
      daily.collectionCents += paidCents;
      dailyTotalsCents.set(payment.payment_date, daily);
    }
  }

  const allTimeBilledCents = canUseSales
    ? sales.reduce((sum, sale) => sum + toCents(Number(sale.total_amount)), 0)
    : null;
  const allTimePaidCents = canCalculateCollected
    ? sales.reduce((sum, sale) => sum + toCents(Number(sale.amount_paid)), 0) +
      payments.reduce((sum, payment) => sum + toCents(Number(payment.amount)), 0)
    : null;
  const outstandingCents = canCalculateCollected
    ? Array.from(totalsByCustomer.values()).reduce(
        (sum, totals) =>
          sum + Math.max(0, totals.billedCents - totals.paidCents),
        0,
      )
    : null;
  const warnings: string[] = [];
  if (!salesAvailable) warnings.push("Sales data is unavailable (public.sales).");
  else if (!salesComplete) {
    warnings.push(
      `Sales exceed the ${MAX_DASHBOARD_ROWS.toLocaleString("en-IN")} row dashboard safety limit; financial totals and trends are withheld.`,
    );
  }
  if (!paymentsAvailable) {
    warnings.push("Payment data is unavailable (public.payments).");
  } else if (!paymentsComplete) {
    warnings.push(
      `Payments exceed the ${MAX_DASHBOARD_ROWS.toLocaleString("en-IN")} row dashboard safety limit; collection and due totals are withheld.`,
    );
  }
  if (!customersComplete) {
    warnings.push(
      `Customer records exceed the ${MAX_DASHBOARD_ROWS.toLocaleString("en-IN")} row dashboard safety limit; the list and customer count may be incomplete.`,
    );
  }

  const customers = customersResult.rows.map((customer) => {
    const totals = totalsByCustomer.get(customer.id) ?? {
      billedCents: 0,
      paidCents: 0,
    };
    const totalBilled = canUseSales ? fromCents(totals.billedCents) : null;
    const totalPaid = canCalculateCollected
      ? fromCents(totals.paidCents)
      : null;
    return {
      ...customer,
      total_billed: totalBilled,
      total_paid: totalPaid,
      pending_balance:
        totalBilled !== null && totalPaid !== null
          ? fromCents(Math.max(0, totals.billedCents - totals.paidCents))
          : null,
    };
  });

  const dailyTotals: Record<string, DailyTotals> = {};
  if (canUseSales) {
    for (const [date, totals] of dailyTotalsCents) {
      dailyTotals[date] = {
        sales: fromCents(totals.salesCents),
        collection: canCalculateCollected
          ? fromCents(totals.collectionCents)
          : null,
      };
    }
  }
  if (canCalculateCollected) {
    for (const [date, totals] of dailyTotalsCents) {
      dailyTotals[date] = {
        sales: fromCents(totals.salesCents),
        collection: fromCents(totals.collectionCents),
      };
    }
    for (const payment of payments) {
      if (!dailyTotals[payment.payment_date]) {
        dailyTotals[payment.payment_date] = {
          sales: 0,
          collection: fromCents(
            dailyTotalsCents.get(payment.payment_date)?.collectionCents ?? 0,
          ),
        };
      }
    }
  }

  return {
    customers,
    totalCustomers: customersComplete ? customers.length : null,
    totalBilled:
      allTimeBilledCents === null ? null : fromCents(allTimeBilledCents),
    totalPaid: allTimePaidCents === null ? null : fromCents(allTimePaidCents),
    outstanding:
      outstandingCents === null ? null : fromCents(outstandingCents),
    dailyTotals,
    recentSales: canUseSales ? sales.slice(0, 8) : [],
    salesAvailable,
    salesComplete,
    paymentsAvailable,
    paymentsComplete,
    customersComplete,
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

async function handleMissingLedgerTable<T>(
  error: unknown,
): Promise<PagedRows<T> | null> {
  if (
    error instanceof SupabaseQueryError &&
    (error.code === "42P01" || error.code === "PGRST205")
  ) {
    return null;
  }
  throw error;
}

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(value: number): number {
  return value / 100;
}

export async function addCustomer(input: {
  name: string;
  phone?: string;
  address?: string;
}): Promise<Database["public"]["Tables"]["customers"]["Row"]> {
  const name = input.name.trim();
  if (!name) throw new Error("Customer name is required.");

  const { data, error } = await getSupabaseClient()
    .from("customers")
    .insert({
      name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
    })
    .select("id, name, phone, address, created_at")
    .single();

  return requireData(data, error);
}

export async function addDailySale(input: {
  customerId: string;
  saleUnit: "500g" | "1kg" | "bulk";
  quantity: number;
  ratePerUnit: number;
  amountPaid?: number;
  saleDate?: string;
  notes?: string;
}): Promise<{
  id: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
}> {
  if (!input.customerId) throw new Error("Select a customer.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }
  if (
    input.saleUnit !== "bulk" &&
    (!Number.isInteger(input.quantity) || input.quantity < 1)
  ) {
    throw new Error("Packet quantity must be a whole number.");
  }
  if (!Number.isFinite(input.ratePerUnit) || input.ratePerUnit < 0.01) {
    throw new Error("Rate per unit must be at least 0.01.");
  }
  if (
    !Number.isFinite(input.amountPaid ?? 0) ||
    (input.amountPaid ?? 0) < 0
  ) {
    throw new Error("Amount paid cannot be negative.");
  }

  const { data, error } = await getSupabaseClient().rpc("add_sale", {
    p_customer_id: input.customerId,
    p_sale_unit: input.saleUnit,
    p_quantity: input.quantity,
    p_rate_per_unit: input.ratePerUnit,
    p_amount_paid: input.amountPaid ?? 0,
    p_sale_date: input.saleDate || new Date().toISOString().slice(0, 10),
    p_notes: input.notes?.trim() || null,
  });
  const result = requireData(data, error);
  const sale = result[0];
  if (!sale) throw new Error("Sale was not created.");
  return sale;
}

export async function fetchDashboardStats(
  saleDate: string,
): Promise<DashboardStats> {
  const { data, error } = await getSupabaseClient().rpc(
    "fetch_dashboard_stats",
    { p_sale_date: saleDate },
  );
  const [stats] = requireData(data, error);
  if (!stats) throw new Error("Dashboard statistics were not returned.");
  return {
    todaysSale: Number(stats.todays_sale),
    todaysCashCollected: Number(stats.todays_cash_collected),
  };
}

export async function recordStandalonePayment(input: {
  customerId: string;
  amount: number;
  paymentDate?: string;
  notes?: string;
}): Promise<string> {
  if (!input.customerId) throw new Error("Select a customer.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Payment must be greater than zero.");
  }

  const { data, error } = await getSupabaseClient().rpc(
    "record_old_due_payment",
    {
      p_customer_id: input.customerId,
      p_amount: input.amount,
      p_payment_date:
        input.paymentDate || new Date().toISOString().slice(0, 10),
      p_notes: input.notes?.trim() || null,
    },
  );
  return requireData(data, error);
}

export async function fetchCustomerLedger(
  customerId: string,
): Promise<LedgerEntry[]> {
  const supabase = getSupabaseClient();
  const [salesResult, paymentsResult] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, sale_date, quantity_kg, unit_price, sale_unit, sale_quantity, rate_per_unit, total_amount, amount_paid, balance, notes, created_at",
      )
      .eq("customer_id", customerId),
    supabase
      .from("payments")
      .select("id, payment_date, amount, notes, created_at")
      .eq("customer_id", customerId),
  ]);
  const sales = requireData(salesResult.data, salesResult.error);
  const payments = requireData(paymentsResult.data, paymentsResult.error);

  const entries: LedgerEntry[] = [
    ...sales.map((sale): LedgerEntry => ({
      id: sale.id,
      kind: "sale",
      date: sale.sale_date,
      description: sale.notes || "Cane sugar sale",
      quantity_kg: Number(sale.quantity_kg),
      unit_price: Number(sale.unit_price),
      sale_unit: sale.sale_unit,
      sale_quantity: Number(sale.sale_quantity),
      rate_per_unit: Number(sale.rate_per_unit),
      debit: Number(sale.total_amount),
      credit: Number(sale.amount_paid),
      balance: Number(sale.balance),
      created_at: sale.created_at,
    })),
    ...payments.map((payment): LedgerEntry => ({
      id: payment.id,
      kind: "payment",
      date: payment.payment_date,
      description: payment.notes || "Payment against old dues",
      quantity_kg: null,
      unit_price: null,
      sale_unit: null,
      sale_quantity: null,
      rate_per_unit: null,
      debit: 0,
      credit: Number(payment.amount),
      balance: 0,
      created_at: payment.created_at,
    })),
  ];

  return entries.sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      right.created_at.localeCompare(left.created_at),
  );
}
