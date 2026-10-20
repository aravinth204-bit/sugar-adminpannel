import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"] & {
  pending_balance: number;
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
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc(
    "fetch_customers_with_balances",
    {},
  );
  if (!error) {
    const customers = requireData(data, null);
    return customers.map((customer) => ({
      ...customer,
      pending_balance: Number(customer.pending_balance),
    }));
  }

  if (error.code !== "PGRST202" && error.code !== "42883") {
    throw new Error(error.message);
  }

  const [customersResult, salesResult, paymentsResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, address, created_at")
      .order("name"),
    supabase.from("sales").select("customer_id, total_amount, amount_paid"),
    supabase.from("payments").select("customer_id, amount"),
  ]);
  const customers = requireData(customersResult.data, customersResult.error);
  const sales = requireData(salesResult.data, salesResult.error);
  const payments = requireData(paymentsResult.data, paymentsResult.error);
  const balanceByCustomer = new Map<string, number>();

  for (const sale of sales) {
    balanceByCustomer.set(
      sale.customer_id,
      (balanceByCustomer.get(sale.customer_id) ?? 0) +
        Number(sale.total_amount) -
        Number(sale.amount_paid),
    );
  }
  for (const payment of payments) {
    balanceByCustomer.set(
      payment.customer_id,
      (balanceByCustomer.get(payment.customer_id) ?? 0) -
        Number(payment.amount),
    );
  }

  return customers.map((customer) => ({
    ...customer,
    pending_balance: Math.max(
      0,
      Math.round((balanceByCustomer.get(customer.id) ?? 0) * 100) / 100,
    ),
  }));
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
