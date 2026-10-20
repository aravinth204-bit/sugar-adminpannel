import {
  addCustomer,
  fetchCustomersWithTotals,
  type Customer,
  type CustomerSummaryResult,
} from "@/lib/supabase";

export type CustomerWithBalance = Customer;

export async function getCustomersWithBalance(): Promise<CustomerSummaryResult> {
  return fetchCustomersWithTotals();
}

export async function createCustomer(input: {
  name: string;
  phone: string;
  address?: string;
}): Promise<CustomerWithBalance> {
  const name = input.name.trim();
  const phone = input.phone.trim();

  if (!name) throw new Error("Customer name is required.");
  if (!/^\d{10}$/.test(phone)) {
    throw new Error("Enter a valid 10-digit phone number.");
  }

  const customer = await addCustomer({
    name,
    phone,
    address: input.address?.trim() || undefined,
  });

  return {
    ...customer,
    total_billed: null,
    total_paid: null,
    pending_balance: null,
  };
}
