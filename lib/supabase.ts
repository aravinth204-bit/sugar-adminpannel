import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type PaymentMethod = "cash" | "upi" | "bank" | "other";

export type Customer = Database["public"]["Tables"]["customers"]["Row"] & {
  total_billed: number | null;
  total_paid: number | null;
  pending_balance: number | null;
  advance_balance: number | null;
  opening_balance: number | null;
  advance_adjustments: number | null;
  last_payment_date: string | null;
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
  overpaid_amount: number;
  credit_applied: number;
  balance: number;
  sale_unit: "500g" | "1kg" | "bulk";
  sale_quantity: number;
  rate_per_unit: number;
  notes: string | null;
  discount_amount: number;
  payment_method: "cash" | "upi";
  status: "completed" | "cancelled";
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

export type SaleRecord = RecentSale;

export type RecentPayment = {
  id: string;
  customer_id: string;
  payment_date: string;
  amount: number;
  notes: string | null;
  payment_method: PaymentMethod;
  reference: string | null;
  paid_at: string;
  created_at: string;
};

export type CustomerSummaryResult = {
  customers: Customer[];
  totalCustomers: number | null;
  totalBilled: number | null;
  totalPaid: number | null;
  outstanding: number | null;
  totalAdvance: number | null;
  openingBalanceTotal: number | null;
  dueCustomerCount: number | null;
  collectedToday: number | null;
  collectedThisMonth: number | null;
  dailyTotals: Record<string, DailyTotals>;
  recentSales: RecentSale[];
  recentPayments: RecentPayment[];
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
      overpaid_amount: number;
      credit_applied: number;
      debit: number;
      credit: number;
      balance: number;
      payment_method: "cash" | "upi";
      reference: null;
      paid_at: string;
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
      overpaid_amount: null;
      credit_applied: null;
      debit: number;
      credit: number;
      balance: number;
      payment_method: PaymentMethod;
      reference: string | null;
      paid_at: string;
      created_at: string;
    }
  | {
      id: string;
      kind: "opening";
      date: string;
      description: string;
      quantity_kg: null;
      unit_price: null;
      sale_unit: null;
      sale_quantity: null;
      rate_per_unit: null;
      overpaid_amount: null;
      credit_applied: null;
      debit: number;
      credit: number;
      balance: number;
      payment_method: null;
      reference: null;
      paid_at: string;
      created_at: string;
    };

export type StockUnit = "500g" | "1kg" | "bulk";

export type StockEntry =
  Database["public"]["Tables"]["stock_entries"]["Row"];

export type StockUnitSummary = {
  unit: StockUnit;
  added: number;
  sold: number;
  remaining: number;
  trackingSince: string | null;
  lastEntry: StockEntry | null;
  soldSinceLastEntry: number;
};

export type StockOverview = {
  available: boolean;
  entries: StockEntry[];
  units: Record<StockUnit, StockUnitSummary>;
  totalStockedPackets: number;
  totalSoldPackets: number;
  packetsInHand: number;
  bulkRemaining: number;
  lastEntry: StockEntry | null;
  soldSinceByEntry: Record<string, number>;
  warning: string | null;
};

type StockSaleRow = {
  sale_unit: StockUnit;
  sale_quantity: number;
  sale_date: string;
  status: "completed" | "cancelled";
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
  | "overpaid_amount"
  | "credit_applied"
  | "balance"
  | "sale_unit"
  | "sale_quantity"
  | "rate_per_unit"
  | "notes"
  | "discount_amount"
  | "payment_method"
  | "status"
  | "cancelled_at"
  | "cancel_reason"
  | "created_at"
>;
type PaymentSummaryRow = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  | "customer_id"
  | "payment_date"
  | "amount"
  | "id"
  | "notes"
  | "payment_method"
  | "reference"
  | "paid_at"
  | "created_at"
>;

type OpeningBalanceRow = Pick<
  Database["public"]["Tables"]["customer_opening_balances"]["Row"],
  "customer_id" | "amount" | "effective_date" | "notes" | "created_at"
>;

type LegacyPaymentSummaryRow = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  "customer_id" | "payment_date" | "amount" | "id" | "notes" | "created_at"
>;

type LegacyLedgerPaymentRow = Pick<
  Database["public"]["Tables"]["payments"]["Row"],
  | "id"
  | "payment_date"
  | "amount"
  | "notes"
  | "created_at"
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

  const [salesResult, paymentsResult, openingResult] = await Promise.all([
    fetchAllPages<SalesSummaryRow>(async (from, to) =>
      await supabase
        .from("sales")
        .select(
          "id, customer_id, sale_date, total_amount, amount_paid, overpaid_amount, credit_applied, balance, sale_unit, sale_quantity, rate_per_unit, notes, discount_amount, payment_method, status, cancelled_at, cancel_reason, created_at",
          { count: from === 0 ? "exact" : undefined },
        )
        .order("sale_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ).catch((error: unknown) => handleMissingTable<SalesSummaryRow>(error)),
    fetchAllPages<PaymentSummaryRow>(async (from, to) =>
      await supabase
        .from("payments")
        .select(
          "customer_id, payment_date, amount, id, notes, payment_method, reference, paid_at, created_at",
          { count: from === 0 ? "exact" : undefined },
        )
        .order("payment_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ).catch(async (error: unknown) => {
      if (isMissingColumnError(error)) {
        const legacy = await fetchAllPages<LegacyPaymentSummaryRow>(
          async (from, to) =>
            await supabase
              .from("payments")
              .select("customer_id, payment_date, amount, id, notes, created_at", {
                count: from === 0 ? "exact" : undefined,
              })
              .order("payment_date", { ascending: false })
              .order("id", { ascending: false })
              .range(from, to),
        );
        return {
          rows: legacy.rows.map(
            (payment): PaymentSummaryRow => ({
              ...payment,
              payment_method: "cash",
              reference: null,
              paid_at: payment.created_at,
            }),
          ),
          complete: legacy.complete,
        };
      }
      return handleMissingTable<PaymentSummaryRow>(error);
    }),
    fetchAllPages<OpeningBalanceRow>(async (from, to) =>
      await supabase
        .from("customer_opening_balances")
        .select("customer_id, amount, effective_date, notes, created_at", {
          count: from === 0 ? "exact" : undefined,
        })
        .order("customer_id")
        .range(from, to),
    ).catch((error: unknown) =>
      handleMissingTable<OpeningBalanceRow>(error),
    ),
  ]);

  const salesAvailable = salesResult !== null;
  const paymentsAvailable = paymentsResult !== null;
  const openingAvailable = openingResult !== null;
  const salesComplete = salesResult?.complete ?? false;
  const paymentsComplete = paymentsResult?.complete ?? false;
  const openingComplete = openingResult?.complete ?? false;
  const customersComplete = customersResult.complete;
  const sales = salesResult?.rows ?? [];
  const payments = paymentsResult?.rows ?? [];
  const openings = openingResult?.rows ?? [];
  const canUseSales = salesAvailable && salesComplete;
  const canUsePayments = paymentsAvailable && paymentsComplete;
  const canCalculateCollected = canUseSales && canUsePayments;
  const totalsByCustomer = new Map<
    string,
    { billedCents: number; paidCents: number }
  >();
  const openingByCustomer = new Map<string, number>();
  const advanceAdjustedByCustomer = new Map<string, number>();
  const lastPaymentByCustomer = new Map<string, string>();
  const dailyTotalsCents = new Map<
    string,
    { salesCents: number; collectionCents: number }
  >();
  const businessDate = getBusinessDate();
  const businessMonth = businessDate.slice(0, 7);
  let todayCollectionCents = 0;
  let monthCollectionCents = 0;

  for (const opening of openings) {
    openingByCustomer.set(
      opening.customer_id,
      toCents(Number(opening.amount)),
    );
    if (!totalsByCustomer.has(opening.customer_id)) {
      totalsByCustomer.set(opening.customer_id, {
        billedCents: 0,
        paidCents: 0,
      });
    }
  }

  if (canUseSales) {
    for (const sale of sales) {
      if (sale.status !== "completed") continue;
      const billedCents = toCents(Number(sale.total_amount));
      const salePaidCents = toCents(
        Number(sale.amount_paid) + Number(sale.overpaid_amount),
      );
      const totals = totalsByCustomer.get(sale.customer_id) ?? {
        billedCents: 0,
        paidCents: 0,
      };
      totals.billedCents += billedCents;
      totals.paidCents += salePaidCents;
      totalsByCustomer.set(sale.customer_id, totals);
      advanceAdjustedByCustomer.set(
        sale.customer_id,
        (advanceAdjustedByCustomer.get(sale.customer_id) ?? 0) +
          toCents(Number(sale.credit_applied)),
      );
      if (salePaidCents > 0) {
        const previousSalePaymentDate = lastPaymentByCustomer.get(
          sale.customer_id,
        );
        if (!previousSalePaymentDate || sale.sale_date > previousSalePaymentDate) {
          lastPaymentByCustomer.set(sale.customer_id, sale.sale_date);
        }
      }
      if (sale.sale_date === businessDate) {
        todayCollectionCents += salePaidCents;
      }
      if (sale.sale_date.startsWith(businessMonth)) {
        monthCollectionCents += salePaidCents;
      }

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
      const previousPaymentDate = lastPaymentByCustomer.get(payment.customer_id);
      if (!previousPaymentDate || payment.payment_date > previousPaymentDate) {
        lastPaymentByCustomer.set(payment.customer_id, payment.payment_date);
      }
      if (payment.payment_date === businessDate) {
        todayCollectionCents += paidCents;
      }
      if (payment.payment_date.startsWith(businessMonth)) {
        monthCollectionCents += paidCents;
      }

      const daily = dailyTotalsCents.get(payment.payment_date) ?? {
        salesCents: 0,
        collectionCents: 0,
      };
      daily.collectionCents += paidCents;
      dailyTotalsCents.set(payment.payment_date, daily);
    }
  }

  const completedSales = sales.filter((sale) => sale.status === "completed");
  const allTimeBilledCents = canUseSales
    ? completedSales.reduce(
        (sum, sale) => sum + toCents(Number(sale.total_amount)),
        0,
      )
    : null;
  const allTimePaidCents = canCalculateCollected
    ? completedSales.reduce(
        (sum, sale) =>
          sum +
          toCents(Number(sale.amount_paid) + Number(sale.overpaid_amount)),
        0,
      ) +
      payments.reduce((sum, payment) => sum + toCents(Number(payment.amount)), 0)
    : null;
  const openingTotalCents = openings.reduce(
    (sum, opening) => sum + toCents(Number(opening.amount)),
    0,
  );
  const outstandingCents = canCalculateCollected
    ? Array.from(totalsByCustomer.entries()).reduce(
        (sum, [customerId, totals]) =>
          sum +
          Math.max(
            0,
            totals.billedCents +
              (openingByCustomer.get(customerId) ?? 0) -
              totals.paidCents,
          ),
        0,
      )
    : null;
  const advanceCents = canCalculateCollected
    ? Array.from(totalsByCustomer.entries()).reduce(
        (sum, [customerId, totals]) =>
          sum +
          Math.max(
            0,
            totals.paidCents -
              totals.billedCents -
              (openingByCustomer.get(customerId) ?? 0),
          ),
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
  if (!openingAvailable) {
    warnings.push(
      "Opening balances are unavailable. Apply the latest Supabase migration so previous dues are included in customer balances.",
    );
  } else if (!openingComplete) {
    warnings.push(
      `Opening balances exceed the ${MAX_DASHBOARD_ROWS.toLocaleString("en-IN")} row dashboard safety limit; previous dues may be incomplete.`,
    );
  }
  if (!customersComplete) {
    warnings.push(
      `Customer records exceed the ${MAX_DASHBOARD_ROWS.toLocaleString("en-IN")} row dashboard safety limit; the list and customer count may be incomplete.`,
    );
  }

  const canUseOpening = openingAvailable && openingComplete;
  const customers = customersResult.rows.map((customer) => {
    const totals = totalsByCustomer.get(customer.id) ?? {
      billedCents: 0,
      paidCents: 0,
    };
    const openingCents = canUseOpening
      ? (openingByCustomer.get(customer.id) ?? 0)
      : 0;
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
          ? fromCents(
              Math.max(0, totals.billedCents + openingCents - totals.paidCents),
            )
          : null,
      advance_balance:
        totalBilled !== null && totalPaid !== null
          ? fromCents(
              Math.max(0, totals.paidCents - totals.billedCents - openingCents),
            )
          : null,
      opening_balance: canUseOpening ? fromCents(openingCents) : null,
      advance_adjustments: canUseSales
        ? fromCents(advanceAdjustedByCustomer.get(customer.id) ?? 0)
        : null,
      last_payment_date: canCalculateCollected
        ? (lastPaymentByCustomer.get(customer.id) ?? null)
        : null,
    };
  });
  const dueCustomerCount = canCalculateCollected
    ? customers.filter(
        (customer) =>
          customer.pending_balance !== null && customer.pending_balance > 0,
      ).length
    : null;

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
    totalAdvance: advanceCents === null ? null : fromCents(advanceCents),
    openingBalanceTotal: canUseOpening ? fromCents(openingTotalCents) : null,
    dueCustomerCount,
    collectedToday: canCalculateCollected
      ? fromCents(todayCollectionCents)
      : null,
    collectedThisMonth: canCalculateCollected
      ? fromCents(monthCollectionCents)
      : null,
    dailyTotals,
    recentSales: canUseSales ? sales.slice(0, 25) : [],
    recentPayments: canCalculateCollected ? payments.slice(0, 25) : [],
    salesAvailable,
    salesComplete,
    paymentsAvailable,
    paymentsComplete,
    customersComplete,
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

function isMissingColumnError(error: unknown): boolean {
  return (
    error instanceof SupabaseQueryError &&
    (error.code === "42703" || error.code === "PGRST204")
  );
}

async function handleMissingTable<T>(
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

export async function updateCustomer(input: {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}): Promise<Database["public"]["Tables"]["customers"]["Row"]> {
  const name = input.name.trim();
  if (!name) throw new Error("Customer name is required.");
  if (!input.id) throw new Error("Customer ID is required.");

  const { data, error } = await getSupabaseClient()
    .from("customers")
    .update({
      name,
      phone: input.phone ? input.phone.trim() : null,
      address: input.address ? input.address.trim() : null,
    })
    .eq("id", input.id)
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
  discount?: number;
  paymentMethod?: "cash" | "upi";
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
  const gross = Math.round(input.quantity * input.ratePerUnit * 100) / 100;
  const discount = Math.round((input.discount ?? 0) * 100) / 100;
  if (!Number.isFinite(discount) || discount < 0 || discount > gross) {
    throw new Error("Discount must be between zero and the bill total.");
  }
  const { data, error } = await getSupabaseClient().rpc("add_sale", {
    p_customer_id: input.customerId,
    p_sale_unit: input.saleUnit,
    p_quantity: input.quantity,
    p_rate_per_unit: input.ratePerUnit,
    p_amount_paid: input.amountPaid ?? 0,
    p_sale_date: input.saleDate || new Date().toISOString().slice(0, 10),
    p_notes: input.notes?.trim() || null,
    p_discount: discount,
    p_payment_method: input.paymentMethod ?? "cash",
  });
  const result = requireData(data, error);
  const sale = result[0];
  if (!sale) throw new Error("Sale was not created.");
  return sale;
}

export async function updateSale(input: {
  saleId: string;
  saleUnit: "500g" | "1kg" | "bulk";
  quantity: number;
  ratePerUnit: number;
  amountPaid?: number;
  discount?: number;
  paymentMethod?: "cash" | "upi";
  saleDate?: string;
  notes?: string;
}): Promise<{
  id: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
}> {
  if (!input.saleId) throw new Error("Sale ID is required.");
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
  const gross = Math.round(input.quantity * input.ratePerUnit * 100) / 100;
  const discount = Math.round((input.discount ?? 0) * 100) / 100;
  if (!Number.isFinite(discount) || discount < 0 || discount > gross) {
    throw new Error("Discount must be between zero and the bill total.");
  }
  if (!Number.isFinite(input.amountPaid ?? 0) || (input.amountPaid ?? 0) < 0) {
    throw new Error("Amount paid cannot be negative.");
  }

  const { data, error } = await getSupabaseClient().rpc("update_sale", {
    p_sale_id: input.saleId,
    p_sale_unit: input.saleUnit,
    p_quantity: input.quantity,
    p_rate_per_unit: input.ratePerUnit,
    p_amount_paid: input.amountPaid ?? 0,
    p_discount: discount,
    p_payment_method: input.paymentMethod ?? "cash",
    p_sale_date: input.saleDate || new Date().toISOString().slice(0, 10),
    p_notes: input.notes?.trim() || null,
  });
  const result = requireData(data, error);
  const sale = result[0];
  if (!sale) throw new Error("Sale was not updated.");
  return sale;
}

export async function cancelSale(
  saleId: string,
  reason?: string,
): Promise<void> {
  if (!saleId) throw new Error("Sale ID is required.");
  const { error } = await getSupabaseClient().rpc("cancel_sale", {
    p_sale_id: saleId,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchSalesHistory(): Promise<SaleRecord[]> {
  const supabase = getSupabaseClient();
  const result = await fetchAllPages<SaleRecord>(async (from, to) =>
    await supabase
      .from("sales")
      .select(
        "id, customer_id, sale_date, total_amount, amount_paid, overpaid_amount, credit_applied, balance, sale_unit, sale_quantity, rate_per_unit, notes, discount_amount, payment_method, status, cancelled_at, cancel_reason, created_at",
        { count: from === 0 ? "exact" : undefined },
      )
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  return result.rows;
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
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
}): Promise<string> {
  if (!input.customerId) throw new Error("Select a customer.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Payment must be greater than zero.");
  }
  if (
    input.paymentMethod &&
    !["cash", "upi", "bank", "other"].includes(input.paymentMethod)
  ) {
    throw new Error("Select a valid payment method.");
  }

  const { data, error } = await getSupabaseClient().rpc(
    "record_customer_payment",
    {
      p_customer_id: input.customerId,
      p_amount: Math.round(input.amount * 100) / 100,
      p_payment_date:
        input.paymentDate || new Date().toISOString().slice(0, 10),
      p_notes: input.notes?.trim() || null,
      p_payment_method: input.paymentMethod ?? "cash",
      p_reference: input.reference?.trim() || null,
      p_paid_at: input.paidAt || new Date().toISOString(),
    },
  );
  return requireData(data, error);
}

export async function setOpeningBalance(input: {
  customerId: string;
  amount: number;
  effectiveDate?: string;
  notes?: string;
}): Promise<string> {
  if (!input.customerId) throw new Error("Select a customer.");
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("Opening balance cannot be negative.");
  }

  const { data, error } = await getSupabaseClient().rpc(
    "set_customer_opening_balance",
    {
      p_customer_id: input.customerId,
      p_amount: Math.round(input.amount * 100) / 100,
      p_effective_date:
        input.effectiveDate || new Date().toISOString().slice(0, 10),
      p_notes: input.notes?.trim() || null,
    },
  );
  return requireData(data, error);
}

export async function fetchCustomerLedger(
  customerId: string,
): Promise<LedgerEntry[]> {
  const supabase = getSupabaseClient();
  const [salesResult, paymentsResult, openingResult] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, sale_date, quantity_kg, unit_price, sale_unit, sale_quantity, rate_per_unit, total_amount, amount_paid, overpaid_amount, credit_applied, balance, notes, payment_method, status, created_at",
      )
      .eq("customer_id", customerId),
    supabase
      .from("payments")
      .select(
        "id, payment_date, amount, notes, payment_method, reference, paid_at, created_at",
      )
      .eq("customer_id", customerId),
    supabase
      .from("customer_opening_balances")
      .select("id, amount, effective_date, notes, created_at")
      .eq("customer_id", customerId)
      .maybeSingle(),
  ]);
  const sales = requireData(salesResult.data, salesResult.error);
  let payments: (LegacyLedgerPaymentRow & {
    payment_method: PaymentMethod;
    reference: string | null;
    paid_at: string;
  })[];
  if (paymentsResult.error) {
    if (
      paymentsResult.error.code === "42703" ||
      paymentsResult.error.code === "PGRST204"
    ) {
      const legacyPayments = await supabase
        .from("payments")
        .select("id, payment_date, amount, notes, created_at")
        .eq("customer_id", customerId);
      payments = requireData(
        legacyPayments.data,
        legacyPayments.error,
      ).map((payment) => ({
        ...payment,
        payment_method: "cash" as PaymentMethod,
        reference: null,
        paid_at: payment.created_at,
      }));
    } else {
      throw new Error(paymentsResult.error.message);
    }
  } else {
    payments = paymentsResult.data;
  }
  const opening = openingResult.error ? null : openingResult.data;

  const entries: LedgerEntry[] = [
    ...(opening && Number(opening.amount) > 0
      ? [
          {
            id: opening.id,
            kind: "opening" as const,
            date: opening.effective_date,
            description:
              opening.notes ||
              "Opening balance carried forward from the previous ledger",
            quantity_kg: null,
            unit_price: null,
            sale_unit: null,
            sale_quantity: null,
            rate_per_unit: null,
            overpaid_amount: null,
            credit_applied: null,
            debit: Number(opening.amount),
            credit: 0,
            balance: 0,
            payment_method: null,
            reference: null,
            paid_at: opening.created_at,
            created_at: opening.created_at,
          },
        ]
      : []),
    ...sales
      .filter((sale) => sale.status === "completed")
      .map((sale): LedgerEntry => ({
        id: sale.id,
        kind: "sale",
        date: sale.sale_date,
        description: sale.notes || "Cane sugar sale",
        quantity_kg: Number(sale.quantity_kg),
        unit_price: Number(sale.unit_price),
        sale_unit: sale.sale_unit,
        sale_quantity: Number(sale.sale_quantity),
        rate_per_unit: Number(sale.rate_per_unit),
        overpaid_amount: Number(sale.overpaid_amount),
        credit_applied: Number(sale.credit_applied),
        debit: Number(sale.total_amount),
        credit: Number(sale.amount_paid) + Number(sale.overpaid_amount),
        balance: Number(sale.balance),
        payment_method: sale.payment_method,
        reference: null,
        paid_at: sale.created_at,
        created_at: sale.created_at,
      })),
    ...payments.map((payment): LedgerEntry => ({
      id: payment.id,
      kind: "payment",
      date: payment.payment_date,
      description: payment.notes || "Customer payment received",
      quantity_kg: null,
      unit_price: null,
      sale_unit: null,
      sale_quantity: null,
      rate_per_unit: null,
      overpaid_amount: null,
      credit_applied: null,
      debit: 0,
      credit: Number(payment.amount),
      balance: 0,
      payment_method: payment.payment_method,
      reference: payment.reference,
      paid_at: payment.paid_at,
      created_at: payment.created_at,
    })),
  ];

  const chronological = entries.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.paid_at.localeCompare(right.paid_at) ||
      left.created_at.localeCompare(right.created_at),
  );
  let runningBalance = 0;
  return chronological
    .map((entry) => {
      runningBalance += entry.debit - entry.credit;
      return { ...entry, balance: runningBalance };
    })
    .reverse();
}

const STOCK_UNITS: StockUnit[] = ["500g", "1kg", "bulk"];

function emptyStockUnit(unit: StockUnit): StockUnitSummary {
  return {
    unit,
    added: 0,
    sold: 0,
    remaining: 0,
    trackingSince: null,
    lastEntry: null,
    soldSinceLastEntry: 0,
  };
}

export async function fetchStockOverview(): Promise<StockOverview> {
  const supabase = getSupabaseClient();
  const [entriesResult, salesResult] = await Promise.all([
    fetchAllPages<StockEntry>(async (from, to) =>
      await supabase
        .from("stock_entries")
        .select("id, stock_unit, quantity, added_on, note, created_at", {
          count: from === 0 ? "exact" : undefined,
        })
        .order("added_on", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ).catch((error: unknown) => handleMissingTable<StockEntry>(error)),
    fetchAllPages<StockSaleRow>(async (from, to) =>
      await supabase
        .from("sales")
        .select("sale_unit, sale_quantity, sale_date, status, created_at", {
          count: from === 0 ? "exact" : undefined,
        })
        .order("sale_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ).catch((error: unknown) => handleMissingTable<StockSaleRow>(error)),
  ]);

  const entries = entriesResult?.rows ?? [];
  const sales = salesResult?.rows ?? [];
  const available = entriesResult !== null && salesResult !== null;
  const warnings: string[] = [];

  if (!entriesResult) {
    warnings.push(
      "Stock tracking is not set up yet. Apply supabase/migrations/20261023000000_stock_entries.sql to your Supabase project.",
    );
  }
  if (!salesResult) {
    warnings.push(
      "Sales data is unavailable, so sold quantities could not be calculated.",
    );
  }
  if (entriesResult && !entriesResult.complete) {
    warnings.push(
      "Stock entries exceed the dashboard safety limit; stock totals may be incomplete.",
    );
  }
  if (salesResult && !salesResult.complete) {
    warnings.push(
      `Sales exceed the ${MAX_DASHBOARD_ROWS.toLocaleString("en-IN")} row dashboard safety limit; sold and remaining quantities may be incomplete.`,
    );
  }

  const units = Object.fromEntries(
    STOCK_UNITS.map((unit) => [unit, emptyStockUnit(unit)]),
  ) as Record<StockUnit, StockUnitSummary>;

  for (const entry of entries) {
    units[entry.stock_unit].added += Number(entry.quantity);
  }

  // Only sales recorded from the first stock update for a packet size are
  // deducted, so sales that happened before stock tracking started do not
  // create a false negative balance.
  for (const unit of STOCK_UNITS) {
    const firstEntry = [...entries]
      .reverse()
      .find((entry) => entry.stock_unit === unit);
    units[unit].trackingSince = firstEntry?.added_on ?? null;
  }
  for (const sale of sales) {
    if (sale.status !== "completed") continue;
    const since = units[sale.sale_unit].trackingSince;
    if (since && sale.sale_date >= since) {
      units[sale.sale_unit].sold += Number(sale.sale_quantity);
    }
  }

  for (const unit of STOCK_UNITS) {
    const summary = units[unit];
    summary.remaining = summary.added - summary.sold;
    summary.lastEntry =
      entries.find((entry) => entry.stock_unit === unit) ?? null;
  }

  const soldSinceByEntry: Record<string, number> = {};
  for (const entry of entries) {
    soldSinceByEntry[entry.id] = sales.reduce(
      (sum, sale) =>
        sale.status === "completed" &&
        sale.sale_unit === entry.stock_unit &&
        sale.sale_date >= entry.added_on
          ? sum + Number(sale.sale_quantity)
          : sum,
      0,
    );
  }
  for (const unit of STOCK_UNITS) {
    const lastEntry = units[unit].lastEntry;
    units[unit].soldSinceLastEntry = lastEntry
      ? soldSinceByEntry[lastEntry.id] ?? 0
      : 0;
  }

  return {
    available,
    entries,
    units,
    totalStockedPackets: units["500g"].added + units["1kg"].added,
    totalSoldPackets: units["500g"].sold + units["1kg"].sold,
    packetsInHand: units["500g"].remaining + units["1kg"].remaining,
    bulkRemaining: units.bulk.remaining,
    lastEntry: entries[0] ?? null,
    soldSinceByEntry,
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

export async function addStockEntry(input: {
  stockUnit: StockUnit;
  quantity: number;
  addedOn?: string;
  note?: string;
}): Promise<StockEntry> {
  if (!STOCK_UNITS.includes(input.stockUnit)) {
    throw new Error("Select a valid stock type.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Stock quantity must be greater than zero.");
  }
  if (input.stockUnit !== "bulk" && !Number.isInteger(input.quantity)) {
    throw new Error("Packet quantity must be a whole number.");
  }

  const { data, error } = await getSupabaseClient()
    .from("stock_entries")
    .insert({
      stock_unit: input.stockUnit,
      quantity: input.quantity,
      added_on: input.addedOn || getBusinessDate(),
      note: input.note?.trim() || null,
    })
    .select("id, stock_unit, quantity, added_on, note, created_at")
    .single();

  return requireData(data, error);
}
