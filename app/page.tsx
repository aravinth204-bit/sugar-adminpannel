"use client";

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Banknote,
  BookOpen,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Edit,
  Eye,
  HandCoins,
  IndianRupee,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MoreVertical,
  Phone,
  Plus,
  Package,
  PackagePlus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Sprout,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addCustomer,
  addDailySale,
  addStockEntry,
  cancelSale,
  fetchCustomerLedger,
  fetchSalesHistory,
  fetchStockOverview,
  getBusinessDate,
  getSupabaseClient,
  recordStandalonePayment,
  setOpeningBalance,
  updateSale,
  type Customer,
  type CustomerSummaryResult,
  type DailyTotals,
  type LedgerEntry,
  type PaymentMethod,
  type SaleRecord,
  type StockOverview,
  type StockUnit,
} from "@/lib/supabase";
import {
  createCustomer,
  editCustomer,
  getCustomersWithBalance,
} from "@/lib/db";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatMoney(amount: number) {
  return money.format(amount);
}

function formatOptionalMoney(amount: number | null) {
  return amount === null ? "Unavailable" : formatMoney(amount);
}

function formatSignedBalance(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  if (rounded > 0) return `− ${formatMoney(rounded)}`;
  if (rounded < 0) return `+ ${formatMoney(Math.abs(rounded))}`;
  return formatMoney(0);
}

function formatMetric(
  amount: number | null | undefined,
  loading: boolean,
  stale: boolean,
) {
  if (loading) return "Refreshing…";
  if (stale || amount == null) return "Unavailable";
  return formatMoney(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function today() {
  return getBusinessDate();
}

function localDateTimeInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function safeWhatsAppPhone(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return "";
}

type ModalKind =
  | "customer"
  | "edit-customer"
  | "customer-details"
  | "sale"
  | "edit-sale"
  | "cancel-sale"
  | "receipt"
  | "payment"
  | "ledger"
  | "reminder"
  | "opening-balance"
  | "stock"
  | null;

export default function Home() {
  const [configured, setConfigured] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dashboardData, setDashboardData] =
    useState<CustomerSummaryResult | null>(null);
  const [businessDate, setBusinessDate] = useState(today);
  const [dataStale, setDataStale] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "due" | "advance" | "settled" | "no-sales">("all");
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerInitialKind, setLedgerInitialKind] = useState<
    "all" | "sale" | "payment" | "opening"
  >("all");
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [salesHistoryLoading, setSalesHistoryLoading] = useState(false);
  const [salesHistoryError, setSalesHistoryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "customers" | "sales" | "payments" | "stock"
  >("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [stock, setStock] = useState<StockOverview | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState("");

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (error) {
      setConfigured(false);
      setAuthError(
        error instanceof Error ? error.message : "Supabase configuration is missing.",
      );
      setAuthLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message);
      setAuthenticated(Boolean(data.session));
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
      setAuthError("");
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshCustomers = useCallback(async () => {
    setDataLoading(true);
    setDataError("");
    setDataStale(false);
    try {
      const result = await getCustomersWithBalance();
      setCustomers(result.customers);
      setDashboardData(result);
      setDataError(result.warning ?? "");
      // Keep any open customer profile or details modal in sync with the
      // freshly calculated billed / paid / pending balances.
      setViewingCustomer((current) =>
        current
          ? (result.customers.find((customer) => customer.id === current.id) ??
            current)
          : current,
      );
      setSelectedCustomer((current) =>
        current
          ? (result.customers.find((customer) => customer.id === current.id) ??
            current)
          : current,
      );
      return !result.warning;
    } catch (error) {
      setDataStale(true);
      setDataError(
        error instanceof Error ? error.message : "Unable to load customer records.",
      );
      return false;
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) void refreshCustomers();
  }, [authenticated, refreshCustomers]);

  const refreshStock = useCallback(async () => {
    setStockLoading(true);
    setStockError("");
    try {
      setStock(await fetchStockOverview());
    } catch (error) {
      setStockError(
        error instanceof Error ? error.message : "Unable to load stock records.",
      );
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      authenticated &&
      (activeTab === "stock" || activeTab === "overview") &&
      !stock
    ) {
      void refreshStock();
    }
  }, [authenticated, activeTab, stock, refreshStock]);

  const refreshSalesHistory = useCallback(async () => {
    setSalesHistoryLoading(true);
    setSalesHistoryError("");
    try {
      setSalesHistory(await fetchSalesHistory());
    } catch (error) {
      setSalesHistoryError(
        error instanceof Error ? error.message : "Unable to load sales history.",
      );
    } finally {
      setSalesHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated && activeTab === "sales") void refreshSalesHistory();
  }, [authenticated, activeTab, refreshSalesHistory]);

  async function refreshSaleData() {
    const customersRefreshed = await refreshCustomers();
    await refreshSalesHistory();
    if (stock || activeTab === "stock" || activeTab === "overview") {
      await refreshStock();
    }
    if (viewingCustomer) {
      void fetchCustomerLedger(viewingCustomer.id)
        .then(setLedger)
        .catch(() => {});
    }
    return customersRefreshed;
  }

  const visibleCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesQuery =
        !normalizedQuery ||
        [customer.name, customer.phone ?? "", customer.address ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      if (!matchesQuery) return false;

      if (statusFilter === "due") {
        return customer.pending_balance !== null && customer.pending_balance > 0;
      }
      if (statusFilter === "advance") {
        return (
          customer.advance_balance !== null && customer.advance_balance > 0
        );
      }
      if (statusFilter === "settled") {
        return (
          (customer.pending_balance === 0 ||
            customer.pending_balance === null) &&
          (customer.advance_balance === 0 ||
            customer.advance_balance === null) &&
          (customer.total_billed ?? 0) + (customer.opening_balance ?? 0) > 0
        );
      }
      if (statusFilter === "no-sales") {
        return (
          ((customer.total_billed ?? 0) === 0 &&
            (customer.opening_balance ?? 0) === 0) ||
          (customer.total_billed === null && customer.pending_balance === null)
        );
      }
      return true;
    });
  }, [customers, query, statusFilter]);

  const activeCustomer = useMemo(() => {
    if (!viewingCustomer) return null;
    return (
      customers.find((customer) => customer.id === viewingCustomer.id) ??
      viewingCustomer
    );
  }, [customers, viewingCustomer]);

  const dailyTotals: DailyTotals | undefined =
    dashboardData?.dailyTotals[businessDate];
  const dailySales =
    dashboardData?.salesAvailable && dashboardData.salesComplete
      ? dailyTotals?.sales ?? 0
      : null;
  const dailyCollection =
    dashboardData?.salesAvailable &&
    dashboardData.salesComplete &&
    dashboardData.paymentsAvailable &&
    dashboardData.paymentsComplete
      ? dailyTotals?.collection ?? 0
      : null;

  const monthKey = businessDate.slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthKey}-01T12:00:00`));
  const monthlySales =
    dashboardData?.salesAvailable &&
    dashboardData.salesComplete &&
    !dataStale
      ? Object.entries(dashboardData.dailyTotals).reduce(
          (sum, [date, totals]) =>
            date.startsWith(monthKey) ? sum + (totals.sales ?? 0) : sum,
          0,
        )
      : null;

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  function openModal(kind: Exclude<ModalKind, null>, customer?: Customer) {
    setFormError("");
    setSuccessMessage("");
    setSelectedCustomer(customer ?? null);
    setSelectedSale(null);
    setModal(kind);
    if ((kind === "ledger" || kind === "customer-details") && customer) {
      setLedgerLoading(true);
      void fetchCustomerLedger(customer.id)
        .then(setLedger)
        .catch((error: unknown) => {
          setFormError(
            error instanceof Error ? error.message : "Unable to load transaction history.",
          );
        })
        .finally(() => setLedgerLoading(false));
    }
  }

  function openLedger(
    customer: Customer,
    kind: "all" | "sale" | "payment" | "opening" = "all",
  ) {
    setLedgerInitialKind(kind);
    openModal("ledger", customer);
  }

  function openSaleModal(
    kind: "edit-sale" | "cancel-sale" | "receipt",
    sale: SaleRecord,
  ) {
    setFormError("");
    setSuccessMessage("");
    setSelectedCustomer(null);
    setSelectedSale(sale);
    setModal(kind);
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setSelectedCustomer(null);
    setSelectedSale(null);
    setFormError("");
  }

  function openCustomerPage(customer: Customer) {
    setFormError("");
    setSuccessMessage("");
    setViewingCustomer(customer);
    setLedger([]);
    setLedgerLoading(true);
    void fetchCustomerLedger(customer.id)
      .then(setLedger)
      .catch((error: unknown) => {
        setFormError(
          error instanceof Error
            ? error.message
            : "Unable to load transaction history.",
        );
      })
      .finally(() => setLedgerLoading(false));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeCustomerPage() {
    setViewingCustomer(null);
    setLedger([]);
    setLedgerLoading(false);
    setFormError("");
  }

  async function handleNewCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      const createdCustomer = await createCustomer({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        address: String(form.get("address") ?? ""),
      });
      const refreshed = await refreshCustomers();
      setCustomers((current) => {
        if (current.some((customer) => customer.id === createdCustomer.id)) {
          return current;
        }
        return [
          ...current,
          {
            ...createdCustomer,
            total_billed: null,
            total_paid: null,
            pending_balance: null,
            advance_balance: null,
          },
        ].sort((left, right) => left.name.localeCompare(right.name));
      });
      setModal(null);
      setSuccessMessage(
        refreshed
          ? "Customer added to your ledger."
          : "Customer added. Customer balances are partially unavailable; see the warning above.",
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add customer.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEditCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCustomer) return;
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      const updated = await editCustomer({
        id: selectedCustomer.id,
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        address: String(form.get("address") ?? ""),
      });
      const refreshed = await refreshCustomers();
      setCustomers((current) =>
        current.map((cust) =>
          cust.id === updated.id
            ? {
                ...cust,
                name: updated.name,
                phone: updated.phone,
                address: updated.address,
              }
            : cust,
        ),
      );
      setModal(null);
      setSelectedCustomer(null);
      setSuccessMessage(
        refreshed
          ? "Customer details updated successfully."
          : "Customer details updated.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to update customer details.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleNewSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    let customerWasCreated = false;
    try {
      let customerId = String(form.get("customerId") ?? "");
      if (customerId === "__new_customer__") {
        const customer = await addCustomer({
          name: String(form.get("newCustomerName") ?? ""),
          phone: String(form.get("newCustomerPhone") ?? ""),
        });
        customerId = customer.id;
        customerWasCreated = true;
      }
      const saleUnit = form.get("saleUnit");
      if (saleUnit !== "500g" && saleUnit !== "1kg" && saleUnit !== "bulk") {
        throw new Error("Select a valid packet weight.");
      }

      await addDailySale({
        customerId,
        saleUnit,
        quantity: Number(form.get("quantity")),
        ratePerUnit: Number(form.get("ratePerUnit")),
        amountPaid: Number(form.get("amountPaid") || 0),
        discount: Number(form.get("discount") || 0),
        paymentMethod: form.get("paymentMethod") === "upi" ? "upi" : "cash",
        saleDate: String(form.get("saleDate") ?? today()),
        notes: String(form.get("notes") ?? ""),
      });
      const customersRefreshed = await refreshSaleData();
      setModal(null);
      setSuccessMessage(
        customersRefreshed
          ? "Sale recorded and customer balance updated."
          : "Sale recorded, but the customer list could not be refreshed. Use Try again to reload it.",
      );
    } catch (error) {
      if (customerWasCreated) await refreshCustomers();
      setFormError(error instanceof Error ? error.message : "Unable to record sale.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSale) return;
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      const saleUnit = form.get("saleUnit");
      if (saleUnit !== "500g" && saleUnit !== "1kg" && saleUnit !== "bulk") {
        throw new Error("Select a valid packet weight.");
      }
      await updateSale({
        saleId: selectedSale.id,
        saleUnit,
        quantity: Number(form.get("quantity")),
        ratePerUnit: Number(form.get("ratePerUnit")),
        amountPaid: Number(form.get("amountPaid") || 0),
        discount: Number(form.get("discount") || 0),
        paymentMethod: form.get("paymentMethod") === "upi" ? "upi" : "cash",
        saleDate: String(form.get("saleDate") ?? selectedSale.sale_date),
        notes: String(form.get("notes") ?? ""),
      });
      const customersRefreshed = await refreshSaleData();
      setModal(null);
      setSelectedSale(null);
      setSuccessMessage(
        customersRefreshed
          ? "Sale updated and customer balance recalculated."
          : "Sale updated, but the customer list could not be refreshed. Use Try again to reload it.",
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to update sale.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSale) return;
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      await cancelSale(selectedSale.id, String(form.get("reason") ?? ""));
      const customersRefreshed = await refreshSaleData();
      setModal(null);
      setSelectedSale(null);
      setSuccessMessage(
        customersRefreshed
          ? "Sale cancelled. It is excluded from balances and stock."
          : "Sale cancelled, but the customer list could not be refreshed. Use Try again to reload it.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to cancel sale.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleNewPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      const paymentCustomerId = String(form.get("customerId") ?? "");
      const paymentAmount = Number(form.get("amount") || 0);
      const customerBeforePayment = customers.find(
        (customer) => customer.id === paymentCustomerId,
      );
      const dueBeforePayment = customerBeforePayment?.pending_balance ?? 0;
      const advanceAdded = Math.max(
        0,
        Math.round((paymentAmount - dueBeforePayment) * 100) / 100,
      );
      const paidAtValue = String(form.get("paidAt") ?? "");
      const paidAt = paidAtValue ? new Date(paidAtValue) : new Date();
      const paymentMethod = String(
        form.get("paymentMethod") ?? "cash",
      ) as PaymentMethod;
      await recordStandalonePayment({
        customerId: paymentCustomerId,
        amount: paymentAmount,
        paymentDate: paidAtValue
          ? paidAtValue.slice(0, 10)
          : today(),
        paidAt: paidAt.toISOString(),
        paymentMethod,
        reference: String(form.get("reference") ?? ""),
        notes: String(form.get("notes") ?? ""),
      });
      const customersRefreshed = await refreshCustomers();
      let ledgerRefreshed = true;
      if (
        viewingCustomer?.id === paymentCustomerId ||
        selectedCustomer?.id === paymentCustomerId
      ) {
        try {
          setLedger(await fetchCustomerLedger(paymentCustomerId));
        } catch {
          ledgerRefreshed = false;
        }
      }
      setModal(null);
      setSuccessMessage(
        !ledgerRefreshed
          ? "Payment recorded, but transaction history could not be refreshed. Reopen the customer to reload it."
          : customersRefreshed
            ? advanceAdded > 0
              ? `Payment recorded. Dues cleared and ${formatMoney(advanceAdded)} saved as customer advance.`
              : "Payment recorded against the customer's pending dues."
            : "Payment recorded, but the customer list could not be refreshed. Use Try again to reload it.",
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to record payment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOpeningBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      const customerId = String(form.get("customerId") ?? "");
      await setOpeningBalance({
        customerId,
        amount: Number(form.get("amount") || 0),
        effectiveDate: String(form.get("effectiveDate") ?? today()),
        notes: String(form.get("notes") ?? ""),
      });
      const refreshed = await refreshCustomers();
      setModal(null);
      setSelectedCustomer(null);
      setSuccessMessage(
        refreshed
          ? "Opening balance saved. It is included in dues but not counted as a sale or new collection."
          : "Opening balance saved, but the customer list could not be refreshed. Use Refresh to reload it.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save the opening balance.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const stockUnit = String(form.get("stockUnit") ?? "");
    try {
      if (stockUnit !== "500g" && stockUnit !== "1kg" && stockUnit !== "bulk") {
        throw new Error("Select a valid packet size.");
      }
      await addStockEntry({
        stockUnit: stockUnit as StockUnit,
        quantity: Number(form.get("quantity")),
        addedOn: String(form.get("addedOn") ?? today()),
        note: String(form.get("note") ?? ""),
      });
      setModal(null);
      setSuccessMessage("Stock update saved. Current stock is refreshed below.");
      await refreshStock();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save the stock update.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoaderCircle className="animate-spin text-[#285d42]" size={28} />
      </div>
    );
  }

  if (!configured || !authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <section className="w-full max-w-[430px] rounded-[28px] border border-[#e9ebe6] bg-white p-8 shadow-[0_20px_70px_rgba(28,43,34,0.08)] sm:p-10">
          <BrandMark />
          <div className="mt-10">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#77837a]">
              Admin workspace
            </span>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              Welcome back
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#7b847e]">
              Sign in to manage your cane sugar sales and customer accounts.
            </p>
          </div>
          {configured ? (
            <form onSubmit={handleSignIn} className="mt-8 space-y-4">
              <label className="block text-sm font-medium text-[#354139]">
                Email address
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@business.com"
                />
              </label>
              <label className="block text-sm font-medium text-[#354139]">
                Password
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                />
              </label>
              {authError && <ErrorNotice>{authError}</ErrorNotice>}
              <button className={`${primaryButton} w-full`} disabled={authBusy}>
                {authBusy ? <LoaderCircle className="animate-spin" size={17} /> : null}
                Sign in securely
              </button>
              <p className="text-center text-xs leading-5 text-[#8b938d]">
                Admin accounts are created in your Supabase project. Public sign-up
                is not enabled.
              </p>
            </form>
          ) : (
            <div className="mt-8">
              <ErrorNotice>{authError}</ErrorNotice>
              <p className="mt-4 text-sm leading-6 text-[#7b847e]">
                Copy{" "}
                <code className="rounded bg-[#f3f4f1] px-1.5 py-1">
                  .env.local.example
                </code>{" "}
                to{" "}
                <code className="rounded bg-[#f3f4f1] px-1.5 py-1">
                  .env.local
                </code>{" "}
                and replace the placeholders with your Supabase project URL and
                publishable anon key. Find them in your Supabase project API
                settings, then restart the development server. Do not use a
                service-role key here.
              </p>
            </div>
          )}
          <div className="mt-9 border-t border-[#eef0eb] pt-5 text-xs text-[#909890]">
            Protected by Supabase authentication and row-level security.
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      {mobileMenu && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[#14241b]/35 lg:hidden"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-[#e9ebe6] bg-white px-5 py-6 transition-transform lg:translate-x-0 ${
          mobileMenu ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <BrandMark />
        <div className="mt-10">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a0a79f]">
            Workspace
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveTab("overview");
              setMobileMenu(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              activeTab === "overview"
                ? "bg-[#eef4ee] text-[#285d42]"
                : "text-[#717b74] hover:bg-[#f7f8f5] hover:text-[#25372c]"
            }`}
          >
            <LayoutDashboard size={18} strokeWidth={1.8} />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("customers");
              setMobileMenu(false);
            }}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              activeTab === "customers"
                ? "bg-[#eef4ee] text-[#285d42] font-semibold"
                : "text-[#717b74] hover:bg-[#f7f8f5] hover:text-[#25372c]"
            }`}
          >
            <Users size={18} strokeWidth={1.8} />
            Customers
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("payments");
              setMobileMenu(false);
            }}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              activeTab === "payments"
                ? "bg-[#eef4ee] text-[#285d42] font-semibold"
                : "text-[#717b74] hover:bg-[#f7f8f5] hover:text-[#25372c]"
            }`}
          >
            <HandCoins size={18} strokeWidth={1.8} />
            Payments &amp; Due
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("sales");
              setMobileMenu(false);
            }}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              activeTab === "sales"
                ? "bg-[#eef4ee] text-[#285d42] font-semibold"
                : "text-[#717b74] hover:bg-[#f7f8f5] hover:text-[#25372c]"
            }`}
          >
            <ShoppingBag size={18} strokeWidth={1.8} />
            Sales &amp; Management
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("stock");
              setMobileMenu(false);
            }}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              activeTab === "stock"
                ? "bg-[#eef4ee] text-[#285d42] font-semibold"
                : "text-[#717b74] hover:bg-[#f7f8f5] hover:text-[#25372c]"
            }`}
          >
            <Boxes size={18} strokeWidth={1.8} />
            Stock
          </button>
        </div>

        <div className="mt-auto">
          <div className="rounded-2xl bg-[#f5f7f3] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#598365] shadow-sm">
              <CircleHelp size={18} />
            </div>
            <p className="mt-3 text-sm font-semibold text-[#2d3c32]">Need a hand?</p>
            <p className="mt-1 text-xs leading-5 text-[#818b83]">
              Keep your daily sales and customer balances up to date in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#7b847e] hover:bg-[#f7f8f5] hover:text-[#25372c]"
          >
            <LogOut size={17} />
            Sign out
          </button>
          <p className="mt-3 px-3 text-[11px] text-[#a0a79f]">Karumbu Ledger · v1.0</p>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[252px]">
        <header className="sticky top-0 z-20 border-b border-[#e9ebe6] bg-[#f7f7f3]/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                className="rounded-lg p-2 text-[#56645a] hover:bg-white lg:hidden"
                onClick={() => setMobileMenu(true)}
              >
                <Menu size={20} />
              </button>
              <div>
                <p className="text-xs text-[#828b84]">Karumbu Sakkarai · Admin</p>
                <h1 className="mt-0.5 text-lg font-semibold tracking-[-0.03em] sm:text-xl">
                  கரும்பு சர்க்கரை - Admin
                </h1>
                <p className="mt-0.5 hidden text-xs text-[#828b84] sm:block">
                  Daily Packet Sales &amp; Customer Ledger
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                aria-label="Refresh all data"
                title="Refresh customers, sales, and stock"
                className={`${secondaryButton} !w-10 !px-0`}
                disabled={dataLoading || salesHistoryLoading || stockLoading}
                onClick={() => void refreshSaleData()}
              >
                <RefreshCw
                  size={16}
                  className={dataLoading ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-7 sm:px-8 sm:pt-9 lg:px-10">
          {activeCustomer ? (
            <CustomerProfilePage
              customer={activeCustomer}
              entries={ledger}
              loading={ledgerLoading}
              error={formError}
              notice={successMessage}
              onDismissNotice={() => setSuccessMessage("")}
              onBack={closeCustomerPage}
              onReceivePayment={() => openModal("payment", activeCustomer)}
              onEditCustomer={() => openModal("edit-customer", activeCustomer)}
            />
          ) : (
            <>
          <section
            id="overview"
            className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"
          >
            <div>
              <h2 className="mt-2 text-[27px] font-semibold tracking-[-0.045em] sm:text-[34px]">
                {activeTab === "overview" && "Dashboard"}
                {activeTab === "customers" && "Customer Directory & Balances"}
                {activeTab === "payments" && "Payments & Due Ledger"}
                {activeTab === "sales" && "Sales & Management"}
                {activeTab === "stock" && "Packet Stock & Inventory"}
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#7b847e]">
                {activeTab === "overview" && "Daily sales, collections, pending balances, monthly sales, and stock at a glance."}
                {activeTab === "customers" && "Search customer records, add new customers, and collect pending dues."}
                {activeTab === "payments" && "Track customer-wise dues, receive full or partial payments, manage opening balances and advances, and send WhatsApp reminders."}
                {activeTab === "sales" && "Record KG or packet sales, take cash or UPI payments, apply discounts, and manage the full sales history."}
                {activeTab === "stock" && "See how many packets you stocked, how many sold, and how much stock is left in hand."}
              </p>
            </div>
          </section>


          {successMessage && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-[#dceade] bg-[#f0f7f0] px-4 py-3 text-sm text-[#356347]">
              <span className="flex items-center gap-2">
                <Check size={17} />
                {successMessage}
              </span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setSuccessMessage("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {dataError && (
            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[#f0d9d4] bg-[#fff6f3] px-4 py-3 text-sm text-[#a64836] sm:flex-row sm:items-center sm:justify-between">
              <span>{dataError}</span>
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => void refreshCustomers()}
              >
                {dataStale ? "Retry" : "Refresh"}
              </button>
            </div>
          )}

          {activeTab === "overview" && (
            <section aria-label="Dashboard" className="mt-8 space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#29382e]">
                      Business overview
                    </h2>
                    <span className="rounded-full bg-[#edf4eb] px-2.5 py-0.5 text-[11px] font-medium text-[#40684b]">
                      Live metrics
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#838c85]">
                    Today&apos;s sales, collections, outstanding balances, and
                    monthly performance.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center text-xs font-medium text-[#69766c]">
                    Business date
                    <input
                      className="ml-2 h-9 rounded-lg border border-[#e2e6df] bg-white px-2.5 text-sm font-medium text-[#34443a] outline-none transition focus:border-[#8eae94] focus:ring-2 focus:ring-[#e7f0e7]"
                      type="date"
                      value={businessDate}
                      onChange={(event) => setBusinessDate(event.target.value)}
                    />
                  </label>
                  {businessDate !== today() && (
                    <button
                      type="button"
                      onClick={() => setBusinessDate(today())}
                      className="h-9 rounded-lg border border-[#e2e6df] bg-white px-2.5 text-xs font-semibold text-[#285d42] transition hover:bg-[#edf4eb]"
                    >
                      Today
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <SummaryCard
                  label="Today's Sales"
                  value={formatMetric(dailySales, dataLoading, dataStale)}
                  detail={`Sales recorded on ${formatBusinessDate(businessDate)}`}
                  icon={<Package size={19} />}
                  accent="amber"
                />
                <SummaryCard
                  label="Today's Collection"
                  value={formatMetric(
                    dailyCollection,
                    dataLoading,
                    dataStale,
                  )}
                  detail={`Collections received on ${formatBusinessDate(businessDate)}`}
                  icon={<Banknote size={19} />}
                  accent="emerald"
                />
                <SummaryCard
                  label="Total Pending Balance"
                  value={formatMetric(
                    dashboardData?.outstanding,
                    dataLoading,
                    dataStale,
                  )}
                  detail="All-time outstanding across customers"
                  icon={<IndianRupee size={19} />}
                  accent="red"
                />
                <SummaryCard
                  label="Customer Advances"
                  value={formatMetric(
                    dashboardData?.totalAdvance,
                    dataLoading,
                    dataStale,
                  )}
                  detail="Extra paid, kept for future purchases"
                  icon={<Wallet size={19} />}
                  accent="green"
                />
                <SummaryCard
                  label={`${monthLabel} Sales`}
                  value={formatMetric(monthlySales, dataLoading, dataStale)}
                  detail="Billed sales for the current month"
                  icon={<Calendar size={19} />}
                  accent="green"
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <StockAlerts
                  data={stock}
                  loading={stockLoading}
                  onManage={() => setActiveTab("stock")}
                />
                <DashboardTransactions
                  sales={dashboardData?.recentSales ?? []}
                  payments={dashboardData?.recentPayments ?? []}
                  customers={customers}
                  complete={Boolean(
                    dashboardData?.salesComplete &&
                      dashboardData?.paymentsComplete,
                  )}
                  onViewAll={() => setActiveTab("sales")}
                />
              </div>

              <p className="text-xs leading-5 text-[#838c85]">
                Date convention: device local business date. Today&apos;s Sales
                reflects sales booked on the selected date; Today&apos;s
                Collection includes spot payments received at sale time plus
                standalone payments received on that date.
              </p>
            </section>
          )}

          {activeTab === "customers" && (
            <section id="customers" className="mt-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-[-0.025em]">Customers</h3>
                  <span className="rounded-full bg-[#e9eee8] px-2 py-0.5 text-xs font-semibold text-[#607165]">
                    {dataStale || dashboardData?.totalCustomers == null
                      ? "—"
                      : dashboardData.totalCustomers}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#838c85]">
                  Keep track of your customer book and pending dues.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Search Bar with clear button */}
                <div className="relative min-w-[200px] flex-1 sm:min-w-[280px]">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#959d96]"
                  />
                  <input
                    className="h-10 w-full rounded-xl border border-[#e5e8e1] bg-white pl-10 pr-9 text-sm outline-none placeholder:text-[#a0a79f] focus:border-[#9ab59e] focus:ring-2 focus:ring-[#e7f0e7]"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by customer name, phone, or area…"
                  />
                  {query && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#9aa49d] hover:bg-[#f0f3ee] hover:text-[#334237]"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[#e5e9e2] bg-[#f8faf7] p-1">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      statusFilter === "all"
                        ? "bg-white text-[#285d42] shadow-sm"
                        : "text-[#6d7970] hover:text-[#25372c]"
                    }`}
                  >
                    All ({customers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("due")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      statusFilter === "due"
                        ? "bg-white text-red-600 shadow-sm"
                        : "text-[#6d7970] hover:text-red-600"
                    }`}
                  >
                    Due (
                    {
                      customers.filter(
                        (c) => c.pending_balance !== null && c.pending_balance > 0,
                      ).length
                    }
                    )
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("advance")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      statusFilter === "advance"
                        ? "bg-white text-sky-700 shadow-sm"
                        : "text-[#6d7970] hover:text-sky-700"
                    }`}
                  >
                    Advance (
                    {
                      customers.filter(
                        (c) =>
                          c.advance_balance !== null && c.advance_balance > 0,
                      ).length
                    }
                    )
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("settled")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      statusFilter === "settled"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-[#6d7970] hover:text-emerald-700"
                    }`}
                  >
                    Fully Paid (
                    {
                      customers.filter(
                        (c) =>
                          c.total_billed !== null &&
                          c.total_billed > 0 &&
                          c.pending_balance === 0 &&
                          (c.advance_balance === 0 ||
                            c.advance_balance === null),
                      ).length
                    }
                    )
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("no-sales")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      statusFilter === "no-sales"
                        ? "bg-white text-[#526356] shadow-sm"
                        : "text-[#6d7970] hover:text-[#25372c]"
                    }`}
                  >
                    No Sales (
                    {
                      customers.filter(
                        (c) =>
                          c.total_billed === 0 ||
                          (c.total_billed === null && c.pending_balance === null),
                      ).length
                    }
                    )
                  </button>
                </div>

                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => openModal("customer")}
                >
                  <Plus size={16} />
                  <span>Add Customer</span>
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-[#e9ebe6] bg-white">
              {dataLoading && customers.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-[#7c867e]">
                  <LoaderCircle size={17} className="animate-spin" />
                  Loading customer book…
                </div>
              ) : visibleCustomers.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f5ef] text-[#5c8264]">
                    {query ? <Search size={21} /> : <Users size={21} />}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-[#354139]">
                    {query || statusFilter !== "all"
                      ? "No matching customers found"
                      : "Your customer book is empty"}
                  </p>
                  <p className="mt-1 text-sm text-[#8a938c]">
                    {query || statusFilter !== "all"
                      ? "Try adjusting your search terms or clearing the filter."
                      : "Add your first customer to start recording sales."}
                  </p>
                  {(query || statusFilter !== "all") && (
                    <button
                      type="button"
                      className={`${secondaryButton} mt-4`}
                      onClick={() => {
                        setQuery("");
                        setStatusFilter("all");
                      }}
                    >
                      Clear search &amp; filters
                    </button>
                  )}
                  {!query && statusFilter === "all" && (
                    <button
                      type="button"
                      className={`${secondaryButton} mt-4`}
                      onClick={() => openModal("customer")}
                    >
                      <Plus size={16} />
                      Add customer
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[1120px] border-collapse text-left">
                      <thead className="border-b border-[#eef0eb] bg-[#fbfcfa]">
                        <tr className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#969e97]">
                          <th className="px-5 py-3">Customer Name</th>
                          <th className="px-4 py-3">Contact &amp; Area</th>
                          <th className="px-4 py-3 text-right">Total Billed</th>
                          <th className="px-4 py-3 text-right">Total Paid</th>
                          <th className="px-4 py-3 text-right">Advance</th>
                          <th className="px-4 py-3 text-right">Balance / பாக்கி</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eef0eb]">
                        {visibleCustomers.map((customer) => {
                          const hasDue =
                            customer.pending_balance !== null &&
                            customer.pending_balance > 0;
                          const hasAdvance =
                            customer.advance_balance !== null &&
                            customer.advance_balance > 0;
                          const isSettled =
                            customer.total_billed !== null &&
                            customer.total_billed > 0 &&
                            customer.pending_balance === 0 &&
                            !hasAdvance;

                          return (
                            <tr
                              key={customer.id}
                              onClick={() => openCustomerPage(customer)}
                              title={`Open ${customer.name}'s details`}
                              className="group cursor-pointer transition hover:bg-[#fafbf9]"
                            >
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf3ec] text-sm font-semibold text-[#52755a]">
                                    {customer.name.trim().charAt(0).toUpperCase()}
                                  </span>
                                  <div>
                                    <span className="block text-sm font-semibold text-[#29382e] transition group-hover:text-[#285d42]">
                                      {customer.name}
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8e9891]">
                                      Joined {formatDate(customer.created_at)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span className="block text-sm text-[#59685d]">
                                  {customer.phone || (
                                    <span className="italic text-[#a4aca6]">No phone</span>
                                  )}
                                </span>
                                <span className="mt-0.5 block max-w-[200px] truncate text-xs text-[#929a93]">
                                  {customer.address || "Area not provided"}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right text-sm text-[#59685d]">
                                {formatOptionalMoney(customer.total_billed)}
                              </td>
                              <td className="px-4 py-4 text-right text-sm text-[#59685d]">
                                {formatOptionalMoney(customer.total_paid)}
                              </td>
                              <td
                                className={`px-4 py-4 text-right text-sm font-semibold ${
                                  hasAdvance
                                    ? "text-sky-700"
                                    : "text-[#9aa39b]"
                                }`}
                              >
                                {hasAdvance
                                  ? formatMoney(customer.advance_balance as number)
                                  : "—"}
                              </td>
                              <td
                                className={`px-4 py-4 text-right text-sm font-bold ${
                                  hasDue
                                    ? "text-red-600"
                                    : customer.pending_balance == null
                                      ? "text-[#8b938d]"
                                      : "text-emerald-700"
                                }`}
                              >
                                {formatOptionalMoney(customer.pending_balance)}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {hasDue ? (
                                  <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                    Due
                                  </span>
                                ) : hasAdvance ? (
                                  <span className="inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                    Advance
                                  </span>
                                ) : isSettled ? (
                                  <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    Paid
                                  </span>
                                ) : (
                                  <span className="inline-block rounded-full bg-[#edf0eb] px-2 py-0.5 text-[11px] font-medium text-[#717d74]">
                                    No Sales
                                  </span>
                                )}
                              </td>
                              <td
                                className="px-5 py-4 text-right"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <div className="flex justify-end">
                                  <CustomerActionsMenu
                                    customer={customer}
                                    onDetails={() => openCustomerPage(customer)}
                                    onReceive={() =>
                                      openModal("payment", customer)
                                    }
                                    onLedger={() => openModal("ledger", customer)}
                                    onEdit={() =>
                                      openModal("edit-customer", customer)
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile & Tablet Card Layout */}
                  <div className="divide-y divide-[#edf0eb] lg:hidden">
                    {visibleCustomers.map((customer) => {
                      const hasDue =
                        customer.pending_balance !== null &&
                        customer.pending_balance > 0;
                      const hasAdvance =
                        customer.advance_balance !== null &&
                        customer.advance_balance > 0;
                      const isSettled =
                        customer.total_billed !== null &&
                        customer.total_billed > 0 &&
                        customer.pending_balance === 0 &&
                        !hasAdvance;

                      return (
                        <div
                          key={customer.id}
                          onClick={() => openCustomerPage(customer)}
                          className="cursor-pointer p-4 transition hover:bg-[#fafbf9] sm:p-5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf3ec] text-sm font-semibold text-[#52755a]">
                                {customer.name.trim().charAt(0).toUpperCase()}
                              </span>
                              <div>
                                <h4 className="text-sm font-semibold text-[#25372c]">
                                  {customer.name}
                                </h4>
                                <div className="mt-1 space-y-0.5 text-xs text-[#6e7b71]">
                                  {customer.phone && (
                                    <p className="flex items-center gap-1">
                                      <Phone size={11} className="text-[#96a198]" />
                                      {customer.phone}
                                    </p>
                                  )}
                                  {customer.address && (
                                    <p className="flex items-center gap-1">
                                      <MapPin size={11} className="text-[#96a198]" />
                                      {customer.address}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div
                              className="flex items-center gap-1.5"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {hasDue ? (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                  Due
                                </span>
                              ) : hasAdvance ? (
                                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                                  Advance
                                </span>
                              ) : isSettled ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                  Paid
                                </span>
                              ) : (
                                <span className="rounded-full bg-[#edf0eb] px-2 py-0.5 text-[10px] font-medium text-[#717d74]">
                                  No Sales
                                </span>
                              )}
                              <CustomerActionsMenu
                                customer={customer}
                                triggerClassName="h-9 w-9 border border-[#e6eae3] bg-white shadow-sm"
                                onDetails={() => openCustomerPage(customer)}
                                onReceive={() => openModal("payment", customer)}
                                onLedger={() => openModal("ledger", customer)}
                                onEdit={() =>
                                  openModal("edit-customer", customer)
                                }
                              />
                            </div>
                          </div>

                          {/* Metrics grid for mobile */}
                          <div className="mt-3.5 grid grid-cols-4 gap-2 rounded-xl bg-[#f8faf7] p-2.5 text-center text-xs">
                            <div>
                              <span className="block text-[10px] text-[#818d83]">Billed</span>
                              <span className="mt-0.5 block font-semibold text-[#324036]">
                                {formatOptionalMoney(customer.total_billed)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-[#818d83]">Paid</span>
                              <span className="mt-0.5 block font-semibold text-[#285d42]">
                                {formatOptionalMoney(customer.total_paid)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-[#818d83]">Advance</span>
                              <span
                                className={`mt-0.5 block font-semibold ${
                                  hasAdvance
                                    ? "text-sky-700"
                                    : "text-[#8f9891]"
                                }`}
                              >
                                {hasAdvance
                                  ? formatMoney(customer.advance_balance as number)
                                  : "—"}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-[#818d83]">Balance</span>
                              <span
                                className={`mt-0.5 block font-bold ${
                                  hasDue
                                    ? "text-red-600"
                                    : "text-emerald-700"
                                }`}
                              >
                                {formatOptionalMoney(customer.pending_balance)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex items-center justify-between border-t border-[#eef0eb] bg-[#fbfcfa] px-5 py-3 text-xs text-[#8d968e]">
                <span>
                  {dataStale
                    ? `Showing ${visibleCustomers.length} customers from the last successful refresh`
                    : dashboardData && !dashboardData.customersComplete
                    ? `Showing ${visibleCustomers.length} customers; full customer count unavailable`
                    : `Showing ${visibleCustomers.length} of ${dashboardData?.totalCustomers ?? 0} customers`}
                </span>
                {dataLoading && (
                  <LoaderCircle size={14} className="animate-spin text-[#78927d]" />
                )}
              </div>
            </div>
          </section>
        )}

          {activeTab === "payments" && (
            <PaymentsDueLedgerPage
              customers={customers}
              summary={dashboardData}
              loading={dataLoading}
              stale={dataStale}
              error={dataError}
              onRefresh={() => void refreshCustomers()}
              onReceivePayment={(customer) => openModal("payment", customer)}
              onViewLedger={(customer) => openLedger(customer, "all")}
              onViewPurchases={(customer) => openLedger(customer, "sale")}
              onReminder={(customer) => openModal("reminder", customer)}
              onOpeningBalance={(customer) =>
                openModal("opening-balance", customer)
              }
            />
          )}

          {activeTab === "stock" && (
            <StockPage
              data={stock}
              loading={stockLoading}
              error={stockError}
              onAddStock={() => openModal("stock")}
              onRetry={() => void refreshStock()}
            />
          )}

          {activeTab === "sales" && (
            <div className="mt-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8ece5] bg-white p-5 shadow-[0_2px_8px_rgba(24,40,30,0.03)]">
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#29382e]">
                    Sales &amp; Management
                  </h3>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-[#838c85]">
                    Record KG or packet sales, take cash or UPI payments, collect
                    full or partial amounts, apply discounts, and manage the full
                    sales history.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => void refreshSalesHistory()}
                    disabled={salesHistoryLoading}
                  >
                    <RefreshCw
                      size={15}
                      className={salesHistoryLoading ? "animate-spin" : ""}
                    />
                    Refresh
                  </button>
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() => openModal("sale")}
                  >
                    <Plus size={16} />
                    New Sale
                  </button>
                </div>
              </div>

              <SalesManagement
                sales={salesHistory}
                customers={customers}
                loading={salesHistoryLoading}
                error={salesHistoryError}
                onEdit={(sale) => openSaleModal("edit-sale", sale)}
                onCancel={(sale) => openSaleModal("cancel-sale", sale)}
                onReceipt={(sale) => openSaleModal("receipt", sale)}
                onRetry={() => void refreshSalesHistory()}
              />
            </div>
          )}

            </>
          )}

          <footer className="mt-8 flex flex-col gap-2 border-t border-[#e7eae4] pt-5 text-xs text-[#929a93] sm:flex-row sm:items-center sm:justify-between">
            <span>Simple books. Strong roots.</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#6da57a]" />
              Your ledger is protected
            </span>
          </footer>
        </div>
      </main>

      {modal && (
        <Modal
          title={modalTitle(modal)}
          onClose={closeModal}
          maxWidth={modal === "customer-details" ? "max-w-2xl" : "max-w-lg"}
        >
          {modal === "customer" && (
            <form onSubmit={handleNewCustomer} className="space-y-4">
              <Field label="Customer name" required>
                <input
                  className={inputClass}
                  name="name"
                  autoFocus
                  required
                  maxLength={120}
                  placeholder="e.g. Lakshmi Stores"
                />
              </Field>
              <Field label="Phone number">
                <input
                  className={inputClass}
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  minLength={10}
                  maxLength={10}
                  required
                  title="Enter a 10-digit phone number."
                  placeholder="9876543210"
                />
              </Field>
              <Field label="Address">
                <input
                  className={inputClass}
                  name="address"
                  maxLength={240}
                  placeholder="Area, town, or village"
                />
              </Field>
              <FormError message={formError} />
              <ModalActions
                onCancel={closeModal}
                saving={saving}
                submitLabel="Add customer"
              />
            </form>
          )}

          {modal === "edit-customer" && selectedCustomer && (
            <form onSubmit={handleEditCustomer} className="space-y-4">
              <Field label="Customer name" required>
                <input
                  className={inputClass}
                  name="name"
                  defaultValue={selectedCustomer.name}
                  autoFocus
                  required
                  maxLength={120}
                  placeholder="e.g. Lakshmi Stores"
                />
              </Field>
              <Field label="Phone number">
                <input
                  className={inputClass}
                  name="phone"
                  defaultValue={selectedCustomer.phone ?? ""}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  minLength={10}
                  maxLength={10}
                  title="Enter a 10-digit phone number."
                  placeholder="9876543210 (optional)"
                />
              </Field>
              <Field label="Address">
                <input
                  className={inputClass}
                  name="address"
                  defaultValue={selectedCustomer.address ?? ""}
                  maxLength={240}
                  placeholder="Area, town, or village (optional)"
                />
              </Field>
              <FormError message={formError} />
              <ModalActions
                onCancel={closeModal}
                saving={saving}
                submitLabel="Save changes"
              />
            </form>
          )}

          {modal === "customer-details" && selectedCustomer && (
            <CustomerDetailsView
              customer={selectedCustomer}
              entries={ledger}
              loading={ledgerLoading}
              error={formError}
              onReceivePayment={() => openModal("payment", selectedCustomer)}
              onEditCustomer={() => openModal("edit-customer", selectedCustomer)}
            />
          )}

          {modal === "sale" && (
            <SaleForm
              customers={customers}
              saving={saving}
              error={formError}
              onSubmit={handleNewSale}
              onCancel={closeModal}
            />
          )}

          {modal === "edit-sale" && selectedSale && (
            <SaleForm
              customers={customers}
              sale={selectedSale}
              saving={saving}
              error={formError}
              onSubmit={handleEditSale}
              onCancel={closeModal}
              submitLabel="Save changes"
            />
          )}

          {modal === "cancel-sale" && selectedSale && (
            <form onSubmit={handleCancelSale} className="space-y-4">
              <div className="rounded-xl border border-[#f0d9d4] bg-[#fff8f5] p-4">
                <p className="text-sm font-semibold text-[#8f4030]">
                  Cancel this sale?
                </p>
                <p className="mt-1 text-xs leading-5 text-[#9a6a60]">
                  The sale will be marked cancelled and removed from customer
                  balances and stock calculations. This cannot be undone from
                  the app.
                </p>
                <div className="mt-3 space-y-1 border-t border-[#f0d9d4] pt-3 text-xs text-[#7d5a52]">
                  <div className="flex justify-between gap-3">
                    <span>Customer</span>
                    <span className="font-semibold text-[#5e3f38]">
                      {customers.find(
                        (customer) => customer.id === selectedSale.customer_id,
                      )?.name ?? "Customer"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Date</span>
                    <span className="font-semibold text-[#5e3f38]">
                      {formatDate(selectedSale.sale_date)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Items</span>
                    <span className="font-semibold text-[#5e3f38]">
                      {saleItemsLabel(selectedSale)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Total</span>
                    <span className="font-semibold text-[#5e3f38]">
                      {formatMoney(Number(selectedSale.total_amount))}
                    </span>
                  </div>
                </div>
              </div>
              <Field label="Cancellation reason (optional)">
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  name="reason"
                  maxLength={300}
                  placeholder="e.g. Wrong packet size or customer returned the sale"
                />
              </Field>
              <FormError message={formError} />
              <div className="flex justify-end gap-2 border-t border-[#eef0eb] pt-4">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={closeModal}
                  disabled={saving}
                >
                  Keep sale
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#b25543] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#9c4737] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Ban size={16} />
                  )}
                  {saving ? "Cancelling…" : "Cancel sale"}
                </button>
              </div>
            </form>
          )}

          {modal === "receipt" && selectedSale && (
            <ReceiptView
              sale={selectedSale}
              customer={customers.find(
                (customer) => customer.id === selectedSale.customer_id,
              )}
              onClose={closeModal}
            />
          )}

          {modal === "payment" && (
            <PaymentForm
              customers={customers}
              saving={saving}
              error={formError}
              onSubmit={handleNewPayment}
              onCancel={closeModal}
              initialCustomerId={selectedCustomer?.id ?? ""}
            />
          )}

          {modal === "ledger" && selectedCustomer && (
            <LedgerView
              customer={selectedCustomer}
              entries={ledger}
              loading={ledgerLoading}
              error={formError}
              initialKind={ledgerInitialKind}
              onReceivePayment={() => openModal("payment", selectedCustomer)}
              onReminder={() => openModal("reminder", selectedCustomer)}
            />
          )}

          {modal === "reminder" && selectedCustomer && (
            <ReminderModal
              customer={selectedCustomer}
              onClose={closeModal}
            />
          )}

          {modal === "opening-balance" && (
            <OpeningBalanceForm
              customers={customers}
              saving={saving}
              error={formError}
              onSubmit={handleOpeningBalance}
              onCancel={closeModal}
              initialCustomerId={selectedCustomer?.id ?? ""}
            />
          )}

          {modal === "stock" && (
            <StockForm
              saving={saving}
              error={formError}
              onSubmit={handleAddStock}
              onCancel={closeModal}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function CustomerDetailsView({
  customer,
  entries,
  loading,
  error,
  onReceivePayment,
  onEditCustomer,
}: {
  customer: Customer;
  entries: LedgerEntry[];
  loading: boolean;
  error: string;
  onReceivePayment: () => void;
  onEditCustomer: () => void;
}) {
  const whatsappPhone = safeWhatsAppPhone(customer.phone);
  const whatsappMessage = `Hello ${customer.name}, your pending balance for Karumbu Sakkarai is ${formatOptionalMoney(customer.pending_balance)}. Please let us know when convenient. Thank you.`;
  const whatsappHref =
    whatsappPhone && (customer.pending_balance ?? 0) > 0
      ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : null;

  const salesEntries = entries.filter((e) => e.kind === "sale");
  const paymentEntries = entries.filter((e) => e.kind === "payment");
  const hasAdvance =
    customer.advance_balance !== null && customer.advance_balance > 0;

  return (
    <div className="space-y-5">
      {/* Profile Header */}
      <div className="rounded-2xl border border-[#e8ece5] bg-[#f8faf7] p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#285d42] text-lg font-bold text-white shadow-sm">
              {customer.name.trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[#25372c]">
                  {customer.name}
                </h3>
                {customer.pending_balance !== null && customer.pending_balance > 0 ? (
                  <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    Due Pending
                  </span>
                ) : hasAdvance ? (
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    Advance {formatMoney(customer.advance_balance as number)}
                  </span>
                ) : customer.total_billed !== null && customer.total_billed > 0 && customer.pending_balance === 0 ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    Fully Paid
                  </span>
                ) : (
                  <span className="rounded-md bg-[#edf0eb] px-2 py-0.5 text-[11px] font-medium text-[#647167]">
                    No Sales
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-1 text-xs text-[#606d63]">
                {customer.phone ? (
                  <p className="flex items-center gap-1.5 font-medium">
                    <Phone size={13} className="text-[#89978c]" />
                    {customer.phone}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 italic text-[#9aa49d]">
                    <Phone size={13} className="text-[#aab3ac]" />
                    No phone number added
                  </p>
                )}
                {customer.address ? (
                  <p className="flex items-center gap-1.5">
                    <MapPin size={13} className="text-[#89978c]" />
                    {customer.address}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 italic text-[#9aa49d]">
                    <MapPin size={13} className="text-[#aab3ac]" />
                    No address provided
                  </p>
                )}
                <p className="flex items-center gap-1.5 text-[11px] text-[#8e9891]">
                  <Calendar size={13} className="text-[#a0aaa2]" />
                  Joined on {formatDate(customer.created_at)}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onEditCustomer}
            className={`${secondaryButton} !h-8 !px-3 text-xs`}
          >
            <Edit size={13} />
            Edit Profile
          </button>
        </div>

        {/* Financial Summary */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#e2e7e0] pt-3 text-center sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl bg-white p-2.5 shadow-sm">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#79857c]">
              Total Billed
            </span>
            <span className="mt-1 block text-sm font-semibold text-[#25372c]">
              {formatOptionalMoney(customer.total_billed)}
            </span>
          </div>
          <div className="rounded-xl bg-white p-2.5 shadow-sm">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#79857c]">
              Total Paid
            </span>
            <span className="mt-1 block text-sm font-semibold text-[#285d42]">
              {formatOptionalMoney(customer.total_paid)}
            </span>
          </div>
          <div className="rounded-xl bg-white p-2.5 shadow-sm">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#79857c]">
              Outstanding Due
            </span>
            <span
              className={`mt-1 block text-sm font-bold ${
                customer.pending_balance !== null && customer.pending_balance > 0
                  ? "text-red-600"
                  : "text-emerald-700"
              }`}
            >
              {formatOptionalMoney(customer.pending_balance)}
            </span>
          </div>
          <div className="rounded-xl bg-white p-2.5 shadow-sm">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#79857c]">
              Advance Credit
            </span>
            <span
              className={`mt-1 block text-sm font-bold ${
                hasAdvance ? "text-sky-700" : "text-[#8b938d]"
              }`}
            >
              {hasAdvance
                ? formatMoney(customer.advance_balance as number)
                : formatOptionalMoney(customer.advance_balance)}
            </span>
          </div>
        </div>
      </div>

      {/* Action shortcuts */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={customer.pending_balance === null}
          onClick={onReceivePayment}
        >
          <Banknote size={16} />
          Receive Payment / Advance
        </button>
        {whatsappHref ? (
          <a
            className={`${secondaryButton} text-[#28734b]`}
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} />
            WhatsApp Reminder
          </a>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            disabled
            title="A 10-digit phone number is required to send a WhatsApp reminder."
          >
            <MessageCircle size={16} />
            WhatsApp Unavailable
          </button>
        )}
      </div>

      <FormError message={error} />

      {/* Transaction History Tabs / Preview */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#68766c]">
            Transaction History ({entries.length})
          </h4>
          <span className="text-[11px] text-[#8e9891]">
            {salesEntries.length} sales · {paymentEntries.length} payments
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#e0e5dd] py-10 text-sm text-[#7c867e]">
            <LoaderCircle size={17} className="animate-spin" />
            Loading transaction history…
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dfe5dc] py-8 text-center">
            <ShoppingBag className="mx-auto text-[#8ca18d]" size={22} />
            <p className="mt-2 text-sm font-semibold text-[#405046]">No transactions recorded</p>
            <p className="mt-1 text-xs text-[#8a938c]">
              Sales and payments recorded for this customer will appear here.
            </p>
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto rounded-xl border border-[#e8ece5] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-[#eef0eb] bg-[#fbfcfa] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#919a92]">
                <tr>
                  <th className="px-3.5 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type &amp; Description</th>
                  <th className="px-3 py-2.5 text-right">Debit</th>
                  <th className="px-3 py-2.5 text-right">Credit</th>
                  <th className="px-3.5 py-2.5 text-right">
                    Balance
                    <span className="ml-1 font-normal normal-case tracking-normal text-[#a7afa9]">
                      (due − / advance +)
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0eb]">
                {entries.map((entry) => (
                  <tr key={`${entry.kind}-${entry.id}`} className="hover:bg-[#fafbf9]">
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-[#657368]">
                      {formatDate(entry.date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-[#2f3f33]">
                        {entry.description}
                      </span>
                      {entry.kind === "sale" && (
                        <span className="block text-[10px] text-[#88948a]">
                          {entry.sale_unit === "bulk"
                            ? `${entry.sale_quantity} kg @ ${formatMoney(entry.rate_per_unit)}`
                            : `${entry.sale_quantity} × ${entry.sale_unit} @ ${formatMoney(entry.rate_per_unit)}`}
                        </span>
                      )}
                      {entry.kind === "sale" && ledgerAdvanceNote(entry) && (
                        <span className="block text-[10px] font-medium text-sky-700">
                          {ledgerAdvanceNote(entry)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#4d5c50]">
                      {entry.debit ? formatMoney(entry.debit) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#285d42]">
                      {entry.credit ? formatMoney(entry.credit) : "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3.5 py-2.5 text-right font-semibold ${
                        entry.balance > 0
                          ? "text-red-600"
                          : entry.balance < 0
                            ? "text-sky-700"
                            : "text-[#48564c]"
                      }`}
                    >
                      {formatSignedBalance(entry.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const STOCK_UNIT_META: Record<
  StockUnit,
  { label: string; shortLabel: string; unitLabel: string; isBulk: boolean }
> = {
  "500g": {
    label: "500g packets",
    shortLabel: "500g",
    unitLabel: "packets",
    isBulk: false,
  },
  "1kg": {
    label: "1kg packets",
    shortLabel: "1kg",
    unitLabel: "packets",
    isBulk: false,
  },
  bulk: {
    label: "Bulk sugar",
    shortLabel: "Bulk",
    unitLabel: "kg",
    isBulk: true,
  },
};

const STOCK_UNIT_ORDER: StockUnit[] = ["500g", "1kg", "bulk"];

function formatStockQty(value: number, isBulk: boolean) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: isBulk ? 3 : 0,
  }).format(value);
}

function StockStat({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "green" | "amber" | "red" | "neutral";
}) {
  const tones = {
    green: "bg-[#eef4ee] text-[#52755a]",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-600",
    neutral: "bg-[#f2f4ef] text-[#6d7970]",
  };

  return (
    <div className="rounded-2xl border border-[#e8ece5] bg-white p-4 shadow-[0_2px_8px_rgba(24,40,30,0.03)]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#87928a]">
          {label}
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2.5 text-xl font-bold tracking-[-0.03em] text-[#25372c]">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#939c95]">{detail}</p>
    </div>
  );
}

function StockPage({
  data,
  loading,
  error,
  onAddStock,
  onRetry,
}: {
  data: StockOverview | null;
  loading: boolean;
  error: string;
  onAddStock: () => void;
  onRetry: () => void;
}) {
  if (!data && loading) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-[#e9ebe6] bg-white py-16 text-sm text-[#7c867e]">
        <LoaderCircle size={18} className="animate-spin" />
        Loading stock details…
      </div>
    );
  }

  const units = data?.units;
  const lastEntry = data?.lastEntry ?? null;
  const packetsInHand = data?.packetsInHand ?? 0;
  const lowStock = packetsInHand <= 0;

  return (
    <section className="mt-8 space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold tracking-[-0.025em]">
              Packet Stock
            </h3>
            {data && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  lowStock
                    ? "bg-red-50 text-red-700"
                    : "bg-[#e9eee8] text-[#607165]"
                }`}
              >
                {lowStock ? "Stock empty" : "In stock"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[#838c85]">
            Stock added, packets sold, and what is left in hand.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={secondaryButton}
            onClick={onRetry}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            className={primaryButton}
            onClick={onAddStock}
            disabled={data ? !data.available : false}
          >
            <PackagePlus size={16} />
            Add Stock
          </button>
        </div>
      </div>

      <FormError message={error} />

      {data && !data.available && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-6 text-amber-900">
          <p className="font-semibold">Stock tracking is not set up yet</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-800">
            Apply{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5">
              supabase/migrations/20261023000000_stock_entries.sql
            </code>{" "}
            in your Supabase project, then press Refresh.
          </p>
        </div>
      )}

      {data?.warning && data.available && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          {data.warning}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StockStat
          label="Packets In Hand"
          value={`${formatStockQty(packetsInHand, false)} packets`}
          detail={
            units
              ? `500g: ${formatStockQty(units["500g"].remaining, false)} · 1kg: ${formatStockQty(units["1kg"].remaining, false)} · Bulk: ${formatStockQty(units.bulk.remaining, true)} kg`
              : "Unavailable"
          }
          icon={<Boxes size={16} />}
          tone={lowStock ? "red" : "green"}
        />
        <StockStat
          label="Total Stocked"
          value={`${formatStockQty(data?.totalStockedPackets ?? 0, false)} packets`}
          detail="All-time packets added to stock"
          icon={<PackagePlus size={16} />}
          tone="amber"
        />
        <StockStat
          label="Total Sold"
          value={`${formatStockQty(data?.totalSoldPackets ?? 0, false)} packets`}
          detail="Packets sold since stock tracking started"
          icon={<ShoppingBag size={16} />}
          tone="neutral"
        />
        <StockStat
          label="Last Stock Update"
          value={lastEntry ? formatDate(lastEntry.added_on) : "—"}
          detail={
            lastEntry
              ? `${formatStockQty(
                  Number(lastEntry.quantity),
                  lastEntry.stock_unit === "bulk",
                )} ${STOCK_UNIT_META[lastEntry.stock_unit].unitLabel} added`
              : "No stock update yet"
          }
          icon={<Calendar size={16} />}
          tone="neutral"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {STOCK_UNIT_ORDER.map((unit) => {
          const meta = STOCK_UNIT_META[unit];
          const summary = units?.[unit];
          const added = summary?.added ?? 0;
          const sold = summary?.sold ?? 0;
          const remaining = summary?.remaining ?? 0;
          const lastUnitEntry = summary?.lastEntry ?? null;
          const soldSince = summary?.soldSinceLastEntry ?? 0;
          const soldPercent =
            added > 0
              ? Math.min(100, Math.max(0, Math.round((sold / added) * 100)))
              : 0;
          const empty = remaining <= 0;

          return (
            <div
              key={unit}
              className="rounded-2xl border border-[#e8ece5] bg-white p-5 shadow-[0_2px_8px_rgba(24,40,30,0.03)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#29382e]">
                    {meta.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8e9891]">
                    {lastUnitEntry
                      ? `Last updated ${formatDate(lastUnitEntry.added_on)}`
                      : "No stock added yet"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    empty
                      ? "bg-red-50 text-red-700"
                      : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {empty ? "Empty" : "Available"}
                </span>
              </div>

              <div className="mt-4 flex items-end gap-1.5">
                <span
                  className={`text-3xl font-bold tracking-[-0.04em] ${
                    empty ? "text-red-600" : "text-[#25372c]"
                  }`}
                >
                  {formatStockQty(remaining, meta.isBulk)}
                </span>
                <span className="pb-1 text-xs font-medium text-[#87928a]">
                  {meta.unitLabel} left
                </span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] font-medium text-[#8b958d]">
                  <span>Sold {formatStockQty(sold, meta.isBulk)}</span>
                  <span>{soldPercent}% of stock</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#edf1ea]">
                  <div
                    className={`h-full rounded-full ${
                      soldPercent >= 100
                        ? "bg-red-500"
                        : soldPercent >= 75
                          ? "bg-amber-500"
                          : "bg-[#5d8f6b]"
                    }`}
                    style={{ width: `${soldPercent}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#eef0eb] pt-3 text-xs">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#99a29b]">
                    Total stocked
                  </span>
                  <span className="mt-0.5 block font-semibold text-[#405046]">
                    {formatStockQty(added, meta.isBulk)} {meta.unitLabel}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#99a29b]">
                    Sold since tracking
                  </span>
                  <span className="mt-0.5 block font-semibold text-[#405046]">
                    {formatStockQty(sold, meta.isBulk)} {meta.unitLabel}
                  </span>
                </div>
              </div>

              <p className="mt-3 rounded-lg bg-[#f7faf5] px-2.5 py-2 text-[11px] leading-4 text-[#6f7d72]">
                {lastUnitEntry
                  ? `Since last update: ${formatStockQty(
                      Number(lastUnitEntry.quantity),
                      meta.isBulk,
                    )} ${meta.unitLabel} added and ${formatStockQty(
                      soldSince,
                      meta.isBulk,
                    )} ${meta.unitLabel} sold.`
                  : "Add a stock entry to start tracking this packet size."}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e9ebe6] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef0eb] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#29382e]">
              Stock Update History
            </h3>
            <p className="mt-0.5 text-xs text-[#8d968e]">
              Every stock addition, with sales since that update.
            </p>
          </div>
          <span className="rounded-full bg-[#edf2eb] px-2.5 py-1 text-[11px] font-semibold text-[#52685a]">
            {data?.entries.length ?? 0} updates
          </span>
        </div>

        {!data || data.entries.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <PackagePlus className="mx-auto text-[#8ca18d]" size={24} />
            <p className="mt-2 text-sm font-semibold text-[#405046]">
              No stock updates yet
            </p>
            <p className="mt-1 text-xs text-[#8a938c]">
              Add your first stock entry to start tracking packets in hand.
            </p>
            <button
              type="button"
              className={`${primaryButton} mt-4`}
              onClick={onAddStock}
              disabled={data ? !data.available : false}
            >
              <PackagePlus size={16} />
              Add Stock
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-[#eef0eb] bg-[#fbfcfa] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#919a92]">
                <tr>
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Packet size</th>
                  <th className="px-4 py-2.5 text-right">Stock added</th>
                  <th className="px-4 py-2.5 text-right">Sold since</th>
                  <th className="px-4 py-2.5">Note</th>
                  <th className="px-5 py-2.5 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0eb]">
                {data.entries.slice(0, 25).map((entry) => {
                  const meta = STOCK_UNIT_META[entry.stock_unit];
                  const soldSince = data.soldSinceByEntry[entry.id] ?? 0;
                  return (
                    <tr key={entry.id} className="hover:bg-[#fafbf9]">
                      <td className="whitespace-nowrap px-5 py-3 font-medium text-[#657368]">
                        {formatDate(entry.added_on)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-[#eef2eb] px-2 py-0.5 text-[10px] font-semibold text-[#5f6f64]">
                          {meta.shortLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#2f3f33]">
                        +{formatStockQty(Number(entry.quantity), meta.isBulk)}{" "}
                        {meta.unitLabel}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-[#59685d]">
                        {formatStockQty(soldSince, meta.isBulk)}{" "}
                        {meta.unitLabel}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-[#7c877f]">
                        {entry.note || "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-[11px] text-[#98a19a]">
                        {new Intl.DateTimeFormat("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(entry.created_at))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-[#eef0eb] bg-[#fbfcfa] px-5 py-3 text-[11px] leading-5 text-[#8d968e]">
          Sold quantities come from recorded sales. Current stock = total stock
          added − quantity sold since tracking started.
        </div>
      </div>
    </section>
  );
}

function StockForm({
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [stockUnit, setStockUnit] = useState<StockUnit>("500g");
  const isBulk = stockUnit === "bulk";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Packet size" required>
        <select
          className={inputClass}
          name="stockUnit"
          value={stockUnit}
          onChange={(event) => setStockUnit(event.target.value as StockUnit)}
          required
        >
          <option value="500g">500g packets</option>
          <option value="1kg">1kg packets</option>
          <option value="bulk">Bulk sugar (kg)</option>
        </select>
      </Field>
      <Field label={isBulk ? "Quantity (kg)" : "Number of packets"} required>
        <input
          className={inputClass}
          name="quantity"
          type="number"
          inputMode="decimal"
          min={isBulk ? "0.001" : "1"}
          step={isBulk ? "0.001" : "1"}
          required
          placeholder={isBulk ? "e.g. 50" : "e.g. 200"}
        />
      </Field>
      <Field label="Stock added on" required>
        <input
          className={inputClass}
          name="addedOn"
          type="date"
          defaultValue={today()}
          max={today()}
          required
        />
      </Field>
      <Field label="Note">
        <input
          className={inputClass}
          name="note"
          maxLength={240}
          placeholder="e.g. Weekly stock from supplier"
        />
      </Field>
      <FormError message={error} />
      <ModalActions
        onCancel={onCancel}
        saving={saving}
        submitLabel="Save stock"
      />
    </form>
  );
}

function CustomerProfilePage({
  customer,
  entries,
  loading,
  error,
  notice,
  onDismissNotice,
  onBack,
  onReceivePayment,
  onEditCustomer,
}: {
  customer: Customer;
  entries: LedgerEntry[];
  loading: boolean;
  error: string;
  notice: string;
  onDismissNotice: () => void;
  onBack: () => void;
  onReceivePayment: () => void;
  onEditCustomer: () => void;
}) {
  const hasDue =
    customer.pending_balance !== null && customer.pending_balance > 0;
  const hasAdvance =
    customer.advance_balance !== null && customer.advance_balance > 0;
  const isSettled =
    (customer.total_billed ?? 0) + (customer.opening_balance ?? 0) > 0 &&
    customer.pending_balance === 0 &&
    !hasAdvance;
  const closingBalance =
    customer.pending_balance !== null && customer.pending_balance > 0
      ? customer.pending_balance
      : customer.advance_balance !== null && customer.advance_balance > 0
        ? -customer.advance_balance
        : 0;
  const whatsappHref = getWhatsAppUrl(customer);
  const salesCount = entries.filter((entry) => entry.kind === "sale").length;
  const paymentCount = entries.filter((entry) => entry.kind === "payment").length;
  const lastPurchase = entries.find((entry) => entry.kind === "sale");
  const lastPayment = entries.find((entry) => entry.kind === "payment");
  const totalObligation =
    (customer.total_billed ?? 0) + (customer.opening_balance ?? 0);
  const paidPercent =
    totalObligation > 0 && customer.total_paid !== null
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((customer.total_paid / totalObligation) * 100),
          ),
        )
      : null;

  const history = useMemo(() => {
    const ascending = [...entries].sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.created_at.localeCompare(right.created_at),
    );
    let running = 0;
    const rows = ascending.map((entry) => {
      running += entry.debit - entry.credit;
      return { entry, running };
    });
    return rows.reverse();
  }, [entries]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-semibold text-[#6d7970] transition hover:text-[#285d42]"
      >
        <ArrowLeft size={16} />
        Back to customers
      </button>

      <section className="mt-4 overflow-hidden rounded-2xl border border-[#e8ece5] bg-white shadow-[0_2px_8px_rgba(24,40,30,0.03)]">
        <div className="flex flex-col gap-4 border-b border-[#eef0eb] bg-[#f8faf7] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#285d42] text-xl font-bold text-white shadow-sm">
              {customer.name.trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#25372c] sm:text-2xl">
                  {customer.name}
                </h2>
                {hasDue ? (
                  <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    Due Pending
                  </span>
                ) : hasAdvance ? (
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    Advance {formatMoney(customer.advance_balance as number)}
                  </span>
                ) : isSettled ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    Fully Paid
                  </span>
                ) : (
                  <span className="rounded-md bg-[#edf0eb] px-2 py-0.5 text-[11px] font-medium text-[#647167]">
                    No Sales
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1 text-xs text-[#606d63] sm:flex-row sm:flex-wrap sm:gap-x-4">
                <span className="flex items-center gap-1.5">
                  <Phone size={13} className="text-[#89978c]" />
                  {customer.phone || (
                    <span className="italic text-[#9aa49d]">No phone</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-[#89978c]" />
                  {customer.address || (
                    <span className="italic text-[#9aa49d]">No area</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-[#8e9891]">
                  <Calendar size={13} className="text-[#a0aaa2]" />
                  Customer since {formatDate(customer.created_at)}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onEditCustomer}
            className={`${secondaryButton} !h-9 !px-3 text-xs`}
          >
            <Edit size={13} />
            Edit Profile
          </button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-4 sm:p-6">
          <div className="rounded-xl border border-[#eef0eb] bg-[#fbfcfa] p-4">
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#87928a]">
              <Package size={13} />
              Total Billed
            </span>
            <p className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#25372c] sm:text-2xl">
              {formatOptionalMoney(customer.total_billed)}
            </p>
            <p className="mt-1 text-[11px] text-[#939c95]">
              வாங்கியது · {salesCount} sales
              {(customer.opening_balance ?? 0) > 0 && (
                <span className="block text-[#9a6133]">
                  Previous due {formatMoney(customer.opening_balance ?? 0)}
                </span>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-[#e3ede3] bg-[#f6faf5] p-4">
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f8a76]">
              <Banknote size={13} />
              Total Paid
            </span>
            <p className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#285d42] sm:text-2xl">
              {formatOptionalMoney(customer.total_paid)}
            </p>
            <p className="mt-1 text-[11px] text-[#7d9483]">
              செலுத்தியது · {paymentCount} due payments
            </p>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              hasDue
                ? "border-[#f3d9d4] bg-[#fff7f4]"
                : "border-[#e3ede3] bg-[#f6faf5]"
            }`}
          >
            <span
              className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                hasDue ? "text-[#b46656]" : "text-[#6f8a76]"
              }`}
            >
              <IndianRupee size={13} />
              Balance Due
            </span>
            <p
              className={`mt-2 text-xl font-bold tracking-[-0.03em] sm:text-2xl ${
                hasDue ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {formatOptionalMoney(customer.pending_balance)}
            </p>
            <p
              className={`mt-1 text-[11px] ${
                hasDue ? "text-[#bd8074]" : "text-[#7d9483]"
              }`}
            >
              {hasDue ? "இன்னும் செலுத்த வேண்டியது" : "All dues cleared"}
              {(customer.opening_balance ?? 0) > 0 && (
                <span className="block">
                  Includes opening {formatMoney(customer.opening_balance ?? 0)}
                </span>
              )}
            </p>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              hasAdvance
                ? "border-[#d8e8f2] bg-[#f4fafd]"
                : "border-[#eef0eb] bg-[#fbfcfa]"
            }`}
          >
            <span
              className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                hasAdvance ? "text-[#3f7a99]" : "text-[#87928a]"
              }`}
            >
              <Wallet size={13} />
              Advance Credit
            </span>
            <p
              className={`mt-2 text-xl font-bold tracking-[-0.03em] sm:text-2xl ${
                hasAdvance ? "text-sky-700" : "text-[#7d8a81]"
              }`}
            >
              {hasAdvance
                ? formatMoney(customer.advance_balance as number)
                : formatOptionalMoney(customer.advance_balance)}
            </p>
            <p
              className={`mt-1 text-[11px] ${
                hasAdvance ? "text-[#6f98ad]" : "text-[#939c95]"
              }`}
            >
              {hasAdvance
                ? "முன்பணம் · used on next purchase"
                : "No advance balance"}
            </p>
          </div>
        </div>

        {paidPercent !== null && (
          <div className="px-5 pb-4 sm:px-6">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#7c877f]">
              <span>Payment progress</span>
              <span>{paidPercent}% paid</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#edf1ea]">
              <div
                className={`h-full rounded-full ${
                  hasDue ? "bg-[#5d8f6b]" : "bg-emerald-600"
                }`}
                style={{ width: `${paidPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-[#eef0eb] px-5 py-4 text-xs sm:grid-cols-4 sm:px-6">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-[#99a29b]">
              Last purchase
            </span>
            <span className="mt-1 block font-semibold text-[#405046]">
              {lastPurchase ? formatDate(lastPurchase.date) : "—"}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-[#99a29b]">
              Last payment
            </span>
            <span className="mt-1 block font-semibold text-[#405046]">
              {lastPayment ? formatDate(lastPayment.date) : "—"}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-[#99a29b]">
              Transactions
            </span>
            <span className="mt-1 block font-semibold text-[#405046]">
              {entries.length}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-[#99a29b]">
              Phone
            </span>
            <span className="mt-1 block font-semibold text-[#405046]">
              {customer.phone || "—"}
            </span>
          </div>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={customer.pending_balance === null}
          onClick={onReceivePayment}
        >
          <Banknote size={16} />
          Receive Payment / Advance
        </button>
        {whatsappHref ? (
          <a
            className={`${secondaryButton} text-[#28734b]`}
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} />
            WhatsApp Reminder
          </a>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            disabled
            title="A valid phone number and balance are required to send a WhatsApp reminder."
          >
            <MessageCircle size={16} />
            WhatsApp Unavailable
          </button>
        )}
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#dceade] bg-[#f0f7f0] px-4 py-3 text-sm text-[#356347]">
          <span className="flex items-center gap-2">
            <Check size={17} />
            {notice}
          </span>
          <button type="button" aria-label="Dismiss notification" onClick={onDismissNotice}>
            <X size={17} />
          </button>
        </div>
      )}

      {error && <FormError message={error} />}

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#e9ebe6] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef0eb] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#29382e]">
              Transaction History
            </h3>
            <p className="mt-0.5 text-xs text-[#8d968e]">
              {salesCount} {salesCount === 1 ? "sale" : "sales"} ·{" "}
              {paymentCount} {paymentCount === 1 ? "payment" : "payments"}
            </p>
          </div>
          <span className="rounded-full bg-[#edf2eb] px-2.5 py-1 text-[11px] font-semibold text-[#52685a]">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[#7c867e]">
            <LoaderCircle size={17} className="animate-spin" />
            Loading transaction history…
          </div>
        ) : history.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ShoppingBag className="mx-auto text-[#8ca18d]" size={24} />
            <p className="mt-2 text-sm font-semibold text-[#405046]">
              No transactions recorded yet
            </p>
            <p className="mt-1 text-xs text-[#8a938c]">
              Sales and payments for {customer.name} will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="border-b border-[#eef0eb] bg-[#fbfcfa] text-[10px] font-semibold uppercase tracking-[0.1em] text-[#919a92]">
                  <tr>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Type &amp; Description</th>
                    <th className="px-4 py-2.5 text-right">Billed</th>
                    <th className="px-4 py-2.5 text-right">Paid</th>
                    <th className="px-5 py-2.5 text-right">
                      Balance
                      <span className="ml-1 font-normal normal-case tracking-normal text-[#a7afa9]">
                        (due − / advance +)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0eb]">
                  {history.map(({ entry, running }) => (
                    <tr
                      key={`${entry.kind}-${entry.id}`}
                      className="hover:bg-[#fafbf9]"
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-medium text-[#657368]">
                        {formatDate(entry.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              entry.kind === "sale"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {entry.kind === "sale"
                              ? "Sale"
                              : entry.kind === "opening"
                                ? "Opening"
                                : "Payment"}
                          </span>
                          <span className="font-semibold text-[#2f3f33]">
                            {entry.description}
                          </span>
                        </div>
                        {entry.kind === "sale" && (
                          <span className="mt-0.5 block text-[10px] text-[#88948a]">
                            {entry.sale_unit === "bulk"
                              ? `${entry.sale_quantity} kg @ ${formatMoney(entry.rate_per_unit)}`
                              : `${entry.sale_quantity} × ${entry.sale_unit} @ ${formatMoney(entry.rate_per_unit)}`}
                          </span>
                        )}
                        {entry.kind === "sale" && ledgerAdvanceNote(entry) && (
                          <span className="mt-0.5 block text-[10px] font-medium text-sky-700">
                            {ledgerAdvanceNote(entry)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-[#4d5c50]">
                        {entry.debit ? formatMoney(entry.debit) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#285d42]">
                        {entry.credit ? formatMoney(entry.credit) : "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-5 py-3 text-right font-semibold ${
                          running > 0
                            ? "text-red-600"
                            : running < 0
                              ? "text-sky-700"
                              : "text-[#48564c]"
                        }`}
                      >
                        {formatSignedBalance(running)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-[#e5e9e2] bg-[#f8faf7]">
                  <tr className="text-xs font-semibold text-[#405046]">
                    <td className="px-5 py-3" colSpan={2}>
                      Totals
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatOptionalMoney(customer.total_billed)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#285d42]">
                      {formatOptionalMoney(customer.total_paid)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right ${
                        closingBalance > 0
                          ? "text-red-600"
                          : closingBalance < 0
                            ? "text-sky-700"
                            : "text-emerald-700"
                      }`}
                    >
                      {formatSignedBalance(closingBalance)}
                    </td>
                  </tr>
                  <tr className="border-t border-[#e5e9e2] text-xs">
                    <td
                      className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7b887e]"
                      colSpan={4}
                    >
                      {closingBalance > 0
                        ? "Closing balance · customer has to pay"
                        : closingBalance < 0
                          ? "Closing balance · customer advance"
                          : "Closing balance · fully settled"}
                    </td>
                    <td
                      className={`px-5 py-2.5 text-right text-sm font-bold ${
                        closingBalance > 0
                          ? "text-red-600"
                          : closingBalance < 0
                            ? "text-sky-700"
                            : "text-emerald-700"
                      }`}
                    >
                      {formatSignedBalance(closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <ul className="divide-y divide-[#eef0eb] md:hidden">
              {history.map(({ entry, running }) => (
                <li
                  key={`${entry.kind}-${entry.id}`}
                  className="px-4 py-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                            entry.kind === "sale"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {entry.kind === "sale"
                            ? "Sale"
                            : entry.kind === "opening"
                              ? "Opening"
                              : "Payment"}
                        </span>
                        <span className="text-[11px] font-medium text-[#87928a]">
                          {formatDate(entry.date)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-[#2f3f33]">
                        {entry.description}
                      </p>
                      {entry.kind === "sale" && (
                        <p className="mt-0.5 text-[11px] text-[#88948a]">
                          {entry.sale_unit === "bulk"
                            ? `${entry.sale_quantity} kg @ ${formatMoney(entry.rate_per_unit)}`
                            : `${entry.sale_quantity} × ${entry.sale_unit} @ ${formatMoney(entry.rate_per_unit)}`}
                        </p>
                      )}
                      {entry.kind === "sale" && ledgerAdvanceNote(entry) && (
                        <p className="mt-0.5 text-[11px] font-medium text-sky-700">
                          {ledgerAdvanceNote(entry)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {entry.debit > 0 && (
                        <p className="text-sm font-semibold text-[#3c4a3f]">
                          {formatMoney(entry.debit)}
                        </p>
                      )}
                      {entry.credit > 0 && (
                        <p className="text-sm font-semibold text-[#285d42]">
                          −{formatMoney(entry.credit)}
                        </p>
                      )}
                      <p
                        className={`mt-0.5 text-[10px] font-semibold ${
                          running > 0
                            ? "text-red-600"
                            : running < 0
                              ? "text-sky-700"
                              : "text-[#98a19a]"
                        }`}
                      >
                        Bal. {formatSignedBalance(running)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-[#e5e9e2] bg-[#f8faf7] px-4 py-3 md:hidden">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#8d968e]">
                    Total billed
                  </span>
                  <span className="mt-0.5 block font-semibold text-[#405046]">
                    {formatOptionalMoney(customer.total_billed)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] uppercase tracking-wider text-[#8d968e]">
                    Total paid
                  </span>
                  <span className="mt-0.5 block font-semibold text-[#285d42]">
                    {formatOptionalMoney(customer.total_paid)}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-[#e2e7e0] pt-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7b887e]">
                  Closing balance
                  <span className="ml-1 font-normal normal-case tracking-normal text-[#a0a9a2]">
                    (due − / advance +)
                  </span>
                </span>
                <span
                  className={`text-sm font-bold ${
                    closingBalance > 0
                      ? "text-red-600"
                      : closingBalance < 0
                        ? "text-sky-700"
                        : "text-emerald-700"
                  }`}
                >
                  {formatSignedBalance(closingBalance)}
                </span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-[#e4e8e1] bg-white px-3.5 text-sm text-[#25372c] outline-none placeholder:text-[#a0a79f] focus:border-[#8eae94] focus:ring-2 focus:ring-[#e7f0e7]";

const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#285d42] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#214d37] disabled:cursor-not-allowed disabled:opacity-65";

const secondaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e2e6df] bg-white px-3.5 text-sm font-semibold text-[#47574b] transition hover:bg-[#f9faf7] disabled:cursor-not-allowed disabled:opacity-65";

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#285d42] text-[#e5f0df] shadow-[0_5px_12px_rgba(40,93,66,0.18)]">
        <Sprout size={21} strokeWidth={1.9} />
      </div>
      <div>
        <p className="text-[15px] font-bold tracking-[-0.035em] text-[#26392d]">
          Karumbu
        </p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.17em] text-[#89938b]">
          Cane sugar ledger
        </p>
      </div>
    </div>
  );
}

function getWhatsAppUrl(customer: Customer) {
  const phone = safeWhatsAppPhone(customer.phone);
  if (!phone || (customer.pending_balance ?? 0) <= 0) return null;
  const message = `Hello ${customer.name}, your pending balance for Karumbu Sakkarai is ${formatOptionalMoney(customer.pending_balance)}. Please let us know when convenient. Thank you.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#3f4f44] transition hover:bg-[#f4f8f2] focus:bg-[#f4f8f2] focus:outline-none disabled:cursor-not-allowed disabled:text-[#a5ada7] disabled:hover:bg-transparent";

function CustomerActionsMenu({
  customer,
  onDetails,
  onReceive,
  onLedger,
  onEdit,
  triggerClassName = "",
}: {
  customer: Customer;
  onDetails: () => void;
  onReceive: () => void;
  onLedger: () => void;
  onEdit: () => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setPosition(null);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const toggle = () => {
    if (open) {
      close();
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = 224;
    const estimatedHeight = 268;
    const spaceBelow = window.innerHeight - rect.bottom;

    const right = Math.max(
      8,
      Math.min(
        window.innerWidth - rect.right,
        Math.max(8, window.innerWidth - width - 8),
      ),
    );

    if (spaceBelow < estimatedHeight && rect.top > spaceBelow) {
      const bottom = window.innerHeight - rect.top + 6;
      setPosition({
        bottom,
        right,
        maxHeight: Math.max(180, window.innerHeight - bottom - 12),
      });
    } else {
      const top = rect.bottom + 6;
      setPosition({
        top,
        right,
        maxHeight: Math.max(180, window.innerHeight - top - 12),
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    const onReposition = () => close();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close]);

  const hasDue =
    customer.pending_balance !== null && customer.pending_balance > 0;
  const hasAdvance =
    customer.advance_balance !== null && customer.advance_balance > 0;
  const canReceive = customer.pending_balance !== null;
  const whatsappUrl = getWhatsAppUrl(customer);

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${customer.name}`}
        title="More actions"
        onClick={toggle}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg transition ${
          open
            ? "bg-[#e7efe6] text-[#285d42]"
            : "text-[#6c7870] hover:bg-[#edf2eb] hover:text-[#285d42]"
        } ${triggerClassName || "h-8 w-8"}`}
      >
        <MoreVertical size={17} />
      </button>

      {open && position && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${customer.name}`}
          style={{
            position: "fixed",
            top: position.top,
            bottom: position.bottom,
            right: position.right,
            width: 224,
            maxHeight: position.maxHeight,
          }}
          className="z-50 overflow-y-auto rounded-xl border border-[#e4e9e1] bg-white p-1.5 shadow-[0_12px_30px_rgba(24,40,30,0.16)]"
        >
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              close();
              onDetails();
            }}
          >
            <Eye size={15} className="text-[#7a8780]" />
            Details
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={!canReceive}
            title={
              canReceive
                ? "Collect dues or save an extra payment as advance"
                : "Customer balances are unavailable"
            }
            className={menuItemClass}
            onClick={() => {
              close();
              onReceive();
            }}
          >
            <Banknote size={15} className="text-[#7a8780]" />
            Receive / Advance
            {hasDue && (
              <span className="ml-auto text-[11px] font-semibold text-red-600">
                {formatMoney(customer.pending_balance as number)}
              </span>
            )}
            {hasAdvance && (
              <span className="ml-auto text-[11px] font-semibold text-sky-700">
                {formatMoney(customer.advance_balance as number)}
              </span>
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              close();
              onLedger();
            }}
          >
            <BookOpen size={15} className="text-[#7a8780]" />
            Ledger
          </button>

          {whatsappUrl ? (
            <a
              role="menuitem"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={menuItemClass}
              onClick={() => close()}
            >
              <MessageCircle size={15} className="text-emerald-600" />
              WhatsApp
            </a>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled
              title={
                customer.pending_balance === null
                  ? "The current balance is unavailable."
                  : "A valid 10-digit phone number is required for WhatsApp."
              }
              className={menuItemClass}
            >
              <MessageCircle size={15} className="text-[#7a8780]" />
              WhatsApp
            </button>
          )}

          <div className="my-1 h-px bg-[#eef1eb]" />

          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              close();
              onEdit();
            }}
          >
            <Edit size={15} className="text-[#7a8780]" />
            Edit customer
          </button>
        </div>
      )}
    </div>
  );
}

function StockAlerts({
  data,
  loading,
  onManage,
}: {
  data: StockOverview | null;
  loading: boolean;
  onManage: () => void;
}) {
  const units = STOCK_UNIT_ORDER.map((unit) => ({
    unit,
    meta: STOCK_UNIT_META[unit],
    summary: data?.units[unit],
  }));
  const alerts = units.filter(({ meta, summary }) => {
    if (!summary) return false;
    const threshold = meta.isBulk ? 10 : 20;
    return summary.remaining <= threshold;
  });

  return (
    <section className="flex flex-col rounded-2xl border border-[#e8ece5] bg-white p-5 shadow-[0_2px_8px_rgba(24,40,30,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[#29382e]">
              Stock alerts
            </h3>
            {data?.available && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  alerts.length
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {alerts.length
                  ? `${alerts.length} need attention`
                  : "All clear"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#838c85]">
            Packet sizes that are low or out of stock.
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf4eb] text-[#52795a]">
          <Boxes size={18} />
        </span>
      </div>

      {loading && !data ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-[#7c867e]">
          <LoaderCircle size={16} className="animate-spin" />
          Checking stock…
        </div>
      ) : !data?.available ? (
        <div className="mt-4 flex-1 rounded-xl border border-dashed border-[#e2e6df] bg-[#fafbf9] px-4 py-6 text-center">
          <p className="text-sm font-semibold text-[#405046]">
            Stock tracking is not set up
          </p>
          <p className="mt-1 text-xs leading-5 text-[#8a938c]">
            Apply the stock migration and add your first stock entry to see
            alerts here.
          </p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="mt-4 flex flex-1 items-center gap-2.5 rounded-xl border border-[#dceade] bg-[#f3f9f1] px-4 py-5">
          <Check size={18} className="shrink-0 text-[#3f7a56]" />
          <div>
            <p className="text-sm font-semibold text-[#356347]">
              Stock levels look healthy
            </p>
            <p className="mt-0.5 text-xs text-[#6f8674]">
              No packet size is running low right now.
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 flex-1 space-y-2">
          {alerts.map(({ unit, meta, summary }) => {
            const remaining = summary?.remaining ?? 0;
            const empty = remaining <= 0;
            return (
              <li
                key={unit}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                  empty
                    ? "border-[#f3d9d4] bg-[#fff7f4]"
                    : "border-[#f0e4c8] bg-[#fffcf2]"
                }`}
              >
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-[#3d4c40]">
                    {meta.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#8b958d]">
                    {formatStockQty(remaining, meta.isBulk)} {meta.unitLabel}{" "}
                    left in hand
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    empty
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {empty ? "Out of stock" : "Low stock"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onManage}
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e2e7e0] bg-white px-3 py-2 text-xs font-semibold text-[#445248] transition hover:bg-[#f6f8f5]"
      >
        Manage stock
        <ArrowUpRight size={13} />
      </button>
    </section>
  );
}

function DashboardTransactions({
  sales,
  payments,
  customers,
  complete,
  onViewAll,
}: {
  sales: CustomerSummaryResult["recentSales"];
  payments: CustomerSummaryResult["recentPayments"];
  customers: Customer[];
  complete: boolean;
  onViewAll: () => void;
}) {
  const customerNames = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  );

  const rows: Array<{
    key: string;
    kind: "sale" | "payment";
    customerId: string;
    date: string;
    createdAt: string;
    amount: number;
    balance: number | null;
    status: "completed" | "cancelled" | null;
  }> = [
    ...sales.map((sale) => ({
      key: `sale-${sale.id}`,
      kind: "sale" as const,
      customerId: sale.customer_id,
      date: sale.sale_date,
      createdAt: sale.created_at,
      amount: Number(sale.total_amount),
      balance: Number(sale.balance),
      status: sale.status,
    })),
    ...payments.map((payment) => ({
      key: `payment-${payment.id}`,
      kind: "payment" as const,
      customerId: payment.customer_id,
      date: payment.payment_date,
      createdAt: payment.created_at,
      amount: Number(payment.amount),
      balance: null,
      status: null,
    })),
  ]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8);

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-[#e8ece5] bg-white shadow-[0_2px_8px_rgba(24,40,30,0.03)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eef0eb] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-[-0.02em] text-[#29382e]">
              Recent transactions
            </h3>
            <span className="rounded-full bg-[#edf4eb] px-2 py-0.5 text-[10px] font-semibold text-[#456c4e]">
              Latest {rows.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#838c85]">
            Latest sales and payments across your ledger.
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#285d42] transition hover:underline"
        >
          View all
          <ArrowUpRight size={13} />
        </button>
      </div>

      {!complete && (
        <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-[11px] leading-5 text-amber-800">
          Some transaction data is unavailable, so this list may be incomplete.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          <ShoppingBag className="text-[#8ca18d]" size={22} />
          <p className="mt-2 text-sm font-semibold text-[#405046]">
            No transactions yet
          </p>
          <p className="mt-1 text-xs text-[#8a938c]">
            Sales and payments you record will show up here.
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-[#eef0eb]">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    row.kind === "sale"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {row.kind === "sale" ? (
                    <ShoppingBag size={15} />
                  ) : (
                    <Banknote size={15} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#29382e]">
                    {customerNames.get(row.customerId) ?? "Customer"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8e9891]">
                    {formatDate(row.date)} ·{" "}
                    {row.kind === "sale" ? "Sale" : "Payment"}
                    {row.status === "cancelled" ? " · Cancelled" : ""}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-sm font-bold ${
                    row.status === "cancelled"
                      ? "text-[#9aa39b] line-through"
                      : row.kind === "payment"
                        ? "text-emerald-700"
                        : "text-[#29382e]"
                  }`}
                >
                  {row.kind === "payment" ? "+" : ""}
                  {formatMoney(row.amount)}
                </p>
                <p
                  className={`mt-0.5 text-[10px] ${
                    row.status === "cancelled"
                      ? "text-[#9aa39b]"
                      : row.kind === "sale" && (row.balance ?? 0) > 0
                        ? "text-red-600"
                        : "text-[#98a19a]"
                  }`}
                >
                  {row.status === "cancelled"
                    ? "Cancelled"
                    : row.kind === "sale"
                      ? (row.balance ?? 0) > 0
                        ? `${formatMoney(row.balance ?? 0)} due`
                        : "Fully paid"
                      : "Payment received"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-[#eef0eb] bg-[#fbfcfa] px-5 py-2.5 text-[11px] text-[#8d968e]">
        Newest transactions first
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  accent: "red" | "emerald" | "amber" | "green";
  className?: string;
}) {
  const accents = {
    red: "bg-red-50 text-red-600 border-red-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    green: "bg-[#edf4eb] text-[#3e6849] border-[#d8e5d6]",
  };

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-[#e8ece5] bg-white p-5 transition-all duration-200 hover:border-[#ccd4c9] hover:shadow-[0_4px_20px_rgba(25,45,32,0.05)] sm:p-5.5 ${className}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#738076]">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105 ${accents[accent]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[27px] font-semibold tracking-[-0.04em] text-[#243329]">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1.5 border-t border-[#f2f4ef] pt-2 text-[11px] text-[#869088]">
        <span>{detail}</span>
      </div>
    </article>
  );
}

function saleItemsLabel(sale: SaleRecord) {
  return sale.sale_unit === "bulk"
    ? `${Number(sale.sale_quantity)} kg bulk`
    : `${Number(sale.sale_quantity)} × ${sale.sale_unit}`;
}

function ledgerAdvanceNote(entry: LedgerEntry) {
  if (entry.kind !== "sale") return "";
  const parts: string[] = [];
  if (entry.credit_applied > 0) {
    parts.push(`Advance used ${formatMoney(entry.credit_applied)}`);
  }
  if (entry.overpaid_amount > 0) {
    parts.push(`Extra to advance ${formatMoney(entry.overpaid_amount)}`);
  }
  return parts.join(" · ");
}

function paymentMethodLabel(method: PaymentMethod) {
  if (method === "upi") return "UPI";
  if (method === "bank") return "Bank transfer";
  if (method === "other") return "Other";
  return "Cash";
}

function saleStatusBadge(sale: SaleRecord) {
  if (sale.status === "cancelled") {
    return { label: "Cancelled", className: "bg-slate-100 text-slate-600" };
  }
  const balance = Number(sale.balance);
  const paid = Number(sale.amount_paid);
  const overpaid = Number(sale.overpaid_amount);
  const creditUsed = Number(sale.credit_applied ?? 0);
  if (balance <= 0) {
    if (overpaid > 0) {
      return { label: "Paid + Adv", className: "bg-sky-50 text-sky-700" };
    }
    if (creditUsed > 0) {
      return { label: "Advance", className: "bg-sky-50 text-sky-700" };
    }
    return { label: "Paid", className: "bg-emerald-50 text-emerald-800" };
  }
  if (paid > 0) {
    return { label: "Partial", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "Unpaid", className: "bg-red-50 text-red-700" };
}

function SalesManagement({
  sales,
  customers,
  loading,
  error,
  onEdit,
  onCancel,
  onReceipt,
  onRetry,
}: {
  sales: SaleRecord[];
  customers: Customer[];
  loading: boolean;
  error: string;
  onEdit: (sale: SaleRecord) => void;
  onCancel: (sale: SaleRecord) => void;
  onReceipt: (sale: SaleRecord) => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "cancelled"
  >("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "cash" | "upi">(
    "all",
  );
  const customerMap = new Map(
    customers.map((customer) => [customer.id, customer]),
  );

  const query = search.trim().toLowerCase();
  const filtered = sales.filter((sale) => {
    const customer = customerMap.get(sale.customer_id);
    const matchesSearch =
      !query ||
      (customer?.name ?? "").toLowerCase().includes(query) ||
      (customer?.phone ?? "").toLowerCase().includes(query) ||
      (sale.notes ?? "").toLowerCase().includes(query);
    const matchesStatus =
      statusFilter === "all" || sale.status === statusFilter;
    const matchesPayment =
      paymentFilter === "all" || sale.payment_method === paymentFilter;
    return matchesSearch && matchesStatus && matchesPayment;
  });

  const completed = filtered.filter((sale) => sale.status === "completed");
  const billed = completed.reduce(
    (sum, sale) => sum + Number(sale.total_amount),
    0,
  );
  const collected = completed.reduce(
    (sum, sale) =>
      sum + Number(sale.amount_paid) + Number(sale.overpaid_amount),
    0,
  );
  const advancesUsed = completed.reduce(
    (sum, sale) => sum + Number(sale.credit_applied ?? 0),
    0,
  );
  const outstanding = completed.reduce(
    (sum, sale) => sum + Math.max(0, Number(sale.balance)),
    0,
  );
  const discounts = completed.reduce(
    (sum, sale) => sum + Number(sale.discount_amount),
    0,
  );
  const cashCollected = completed
    .filter((sale) => sale.payment_method === "cash")
    .reduce(
      (sum, sale) =>
        sum + Number(sale.amount_paid) + Number(sale.overpaid_amount),
      0,
    );
  const upiCollected = completed
    .filter((sale) => sale.payment_method === "upi")
    .reduce(
      (sum, sale) =>
        sum + Number(sale.amount_paid) + Number(sale.overpaid_amount),
      0,
    );
  const cancelledCount = filtered.filter(
    (sale) => sale.status === "cancelled",
  ).length;

  const summaryItems = [
    {
      label: "Sales shown",
      value: filtered.length.toLocaleString("en-IN"),
      tone: "text-[#29382e]",
    },
    {
      label: "Billed",
      value: formatMoney(billed),
      tone: "text-[#29382e]",
    },
    {
      label: "Collected at sale",
      value: formatMoney(collected),
      tone: "text-[#285d42]",
    },
    {
      label: "Cash / UPI",
      value: `${formatMoney(cashCollected)} / ${formatMoney(upiCollected)}`,
      tone: "text-emerald-700",
    },
    {
      label: "Advance used",
      value: formatMoney(advancesUsed),
      tone: "text-sky-700",
    },
    {
      label: "Due at sale",
      value: formatMoney(outstanding),
      tone: outstanding > 0 ? "text-red-600" : "text-emerald-700",
    },
    {
      label: "Discounts",
      value: formatMoney(discounts),
      tone: "text-[#9a6133]",
    },
  ];

  return (
    <section
      aria-labelledby="sales-management-heading"
      className="overflow-hidden rounded-2xl border border-[#e8ece5] bg-white shadow-[0_2px_8px_rgba(24,40,30,0.03)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eef0eb] px-5 py-5 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="sales-management-heading"
              className="text-lg font-semibold tracking-[-0.025em] text-[#29382e]"
            >
              Sales history
            </h2>
            <span className="rounded-full bg-[#edf4eb] px-2 py-0.5 text-[10px] font-semibold text-[#456c4e]">
              KG / Packet · Cash / UPI
            </span>
            {cancelledCount > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {cancelledCount} cancelled
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#838c85]">
            Each row shows what was sold, how much was paid, how much advance
            was used, and what is still due. Newest sales first.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#7c877f]">
            <span>
              <strong className="font-semibold text-[#285d42]">Paid now</strong>{" "}
              = cash/UPI received at sale
            </span>
            <span className="text-[#c2c9c1]">·</span>
            <span>
              <strong className="font-semibold text-sky-700">
                Advance used
              </strong>{" "}
              = old credit adjusted
            </span>
            <span className="text-[#c2c9c1]">·</span>
            <span>
              <strong className="font-semibold text-red-600">Due</strong> =
              still to pay
            </span>
          </div>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf4eb] text-[#52795a]">
          <ShoppingBag size={19} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-[#eef0eb] bg-[#eef0eb] sm:grid-cols-4 xl:grid-cols-7">
        {summaryItems.map((item) => (
          <div key={item.label} className="bg-[#fbfcfa] px-5 py-3.5 sm:px-6">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8d968e]">
              {item.label}
            </span>
            <span
              className={`mt-1 block text-sm font-bold tracking-[-0.02em] ${item.tone}`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 border-b border-[#eef0eb] bg-white px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#96a098]"
          />
          <input
            className={`${inputClass} !mt-0 pl-9`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, phone, or note"
            aria-label="Search sales"
          />
        </div>
        <select
          className={`${inputClass} !mt-0 sm:w-40`}
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as "all" | "completed" | "cancelled",
            )
          }
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          className={`${inputClass} !mt-0 sm:w-36`}
          value={paymentFilter}
          onChange={(event) =>
            setPaymentFilter(event.target.value as "all" | "cash" | "upi")
          }
          aria-label="Filter by payment method"
        >
          <option value="all">All payments</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
        </select>
        <span className="text-[11px] text-[#8d968e] sm:ml-auto">
          {filtered.length} of {sales.length} sale
          {sales.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-900 sm:px-6">
          <span>{error}</span>
          <button
            type="button"
            className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 font-semibold text-amber-900"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      )}

      {loading && sales.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-[#7c867e]">
          <LoaderCircle size={16} className="animate-spin" />
          Loading sales history…
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <ShoppingBag className="mx-auto text-[#8ca18d]" size={24} />
          <p className="mt-2 text-sm font-semibold text-[#405046]">
            {sales.length === 0
              ? "No sales have been recorded yet"
              : "No sales match these filters"}
          </p>
          <p className="mt-1 text-xs text-[#8a938c]">
            {sales.length === 0
              ? "Record a sale to see its discount, payment method, and balance here."
              : "Try a different search, status, or payment method."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1080px] text-left">
              <thead className="border-b border-[#eef0eb] bg-[#fbfcfa]">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#969e97]">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Sale details</th>
                  <th className="px-4 py-3">Payment breakdown</th>
                  <th className="px-4 py-3 text-right">Bill</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0eb]">
                {filtered.map((sale) => {
                  const customer = customerMap.get(sale.customer_id);
                  const status = saleStatusBadge(sale);
                  const total = Number(sale.total_amount);
                  const paidNow = Number(sale.amount_paid);
                  const overpaid = Number(sale.overpaid_amount);
                  const creditUsed = Number(sale.credit_applied ?? 0);
                  const balance = Number(sale.balance);
                  const isCancelled = sale.status === "cancelled";

                  return (
                    <tr
                      key={sale.id}
                      className={`transition-colors hover:bg-[#fafbf9] ${
                        isCancelled ? "bg-[#fbfbfb] text-[#8b948d]" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span className="block text-xs font-semibold text-[#37463a]">
                          {formatDate(sale.sale_date)}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[#929b93]">
                          {new Intl.DateTimeFormat("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(sale.created_at))}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="block text-sm font-semibold text-[#29382e]">
                          {customer?.name ?? "Customer"}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#8e9891]">
                          {customer?.phone || "No phone"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex rounded-md bg-[#f2f5ef] px-2 py-0.5 text-[11px] font-semibold text-[#5d6c61]">
                          {saleItemsLabel(sale)}
                        </span>
                        <span className="mt-1 block text-[10px] text-[#929b93]">
                          @ {formatMoney(Number(sale.rate_per_unit))}
                          {sale.sale_unit === "bulk" ? " / kg" : " each"}
                        </span>
                        {Number(sale.discount_amount) > 0 && (
                          <span className="mt-0.5 block text-[10px] font-medium text-[#9a6133]">
                            Discount {formatMoney(Number(sale.discount_amount))}
                          </span>
                        )}
                        {sale.notes && (
                          <span className="mt-0.5 block max-w-[190px] truncate text-[10px] italic text-[#a0a79f]">
                            {sale.notes}
                          </span>
                        )}
                        {sale.status === "cancelled" && sale.cancel_reason && (
                          <span className="mt-0.5 block max-w-[190px] truncate text-[10px] text-[#9a6a60]">
                            Cancelled: {sale.cancel_reason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            sale.payment_method === "upi"
                              ? "bg-sky-50 text-sky-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {paymentMethodLabel(sale.payment_method)}
                        </span>
                        <div className="mt-2 space-y-1 text-[11px]">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-[#7c877f]">Paid now</span>
                            <span className="font-semibold text-[#285d42]">
                              {formatMoney(paidNow)}
                            </span>
                          </div>
                          {creditUsed > 0 && (
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[#7c877f]">
                                Advance used
                              </span>
                              <span className="font-semibold text-sky-700">
                                {formatMoney(creditUsed)}
                              </span>
                            </div>
                          )}
                          {overpaid > 0 && (
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[#7c877f]">
                                Extra → advance
                              </span>
                              <span className="font-semibold text-sky-700">
                                {formatMoney(overpaid)}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3.5 text-right align-top text-sm font-semibold ${
                          isCancelled
                            ? "text-[#9aa39b] line-through"
                            : "text-[#3c4a3f]"
                        }`}
                      >
                        {formatMoney(total)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right align-top">
                        {isCancelled ? (
                          <span className="text-sm font-semibold text-[#9aa39b]">
                            —
                          </span>
                        ) : balance > 0 ? (
                          <>
                            <span className="block text-sm font-bold text-red-600">
                              Due {formatMoney(balance)}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[#b07c74]">
                              still to pay
                            </span>
                          </>
                        ) : overpaid > 0 ? (
                          <>
                            <span className="block text-sm font-bold text-sky-700">
                              Advance {formatMoney(overpaid)}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[#6f98ad]">
                              saved for next sale
                            </span>
                          </>
                        ) : creditUsed > 0 ? (
                          <>
                            <span className="block text-sm font-bold text-emerald-700">
                              Settled
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[#7d9483]">
                              covered by advance
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block text-sm font-bold text-emerald-700">
                              Settled
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[#7d9483]">
                              fully paid
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Print receipt"
                            aria-label={`Print receipt for ${customer?.name ?? "sale"}`}
                            onClick={() => onReceipt(sale)}
                            className="rounded-lg border border-[#e6eae4] bg-white p-1.5 text-[#627067] transition hover:bg-[#f3f6f1]"
                          >
                            <Printer size={14} />
                          </button>
                          {sale.status === "completed" && (
                            <>
                              <button
                                type="button"
                                title="Edit sale"
                                aria-label="Edit sale"
                                onClick={() => onEdit(sale)}
                                className="rounded-lg border border-[#e6eae4] bg-white p-1.5 text-[#627067] transition hover:bg-[#f3f6f1]"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                title="Cancel sale"
                                aria-label="Cancel sale"
                                onClick={() => onCancel(sale)}
                                className="rounded-lg border border-[#f0d9d4] bg-white p-1.5 text-[#b25543] transition hover:bg-[#fff4f1]"
                              >
                                <Ban size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-[#eef0eb] lg:hidden">
            {filtered.map((sale) => {
              const customer = customerMap.get(sale.customer_id);
              const status = saleStatusBadge(sale);
              const total = Number(sale.total_amount);
              const paidNow = Number(sale.amount_paid);
              const overpaid = Number(sale.overpaid_amount);
              const creditUsed = Number(sale.credit_applied ?? 0);
              const balance = Number(sale.balance);
              const isCancelled = sale.status === "cancelled";

              return (
                <li
                  key={sale.id}
                  className={`px-4 py-4 ${isCancelled ? "bg-[#fbfbfb]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-[#657368]">
                          {formatDate(sale.sale_date)}
                        </span>
                        <span className="text-[10px] text-[#a0a79f]">
                          {new Intl.DateTimeFormat("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(sale.created_at))}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-[#29382e]">
                        {customer?.name ?? "Customer"}
                      </p>
                      <p className="text-[11px] text-[#8e9891]">
                        {customer?.phone || "No phone"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}
                      >
                        {status.label}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          sale.payment_method === "upi"
                            ? "bg-sky-50 text-sky-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {paymentMethodLabel(sale.payment_method)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#6e7b71]">
                    <span className="rounded-md bg-[#f2f5ef] px-1.5 py-0.5 font-semibold text-[#5d6c61]">
                      {saleItemsLabel(sale)}
                    </span>
                    <span>
                      @ {formatMoney(Number(sale.rate_per_unit))}
                      {sale.sale_unit === "bulk" ? " / kg" : " each"}
                    </span>
                    {Number(sale.discount_amount) > 0 && (
                      <span className="font-medium text-[#9a6133]">
                        · Discount {formatMoney(Number(sale.discount_amount))}
                      </span>
                    )}
                    {sale.notes && (
                      <span className="w-full truncate italic text-[#a0a79f]">
                        {sale.notes}
                      </span>
                    )}
                    {sale.status === "cancelled" && sale.cancel_reason && (
                      <span className="w-full truncate text-[#9a6a60]">
                        Cancelled: {sale.cancel_reason}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#f8faf7] p-2.5 text-xs">
                    <div>
                      <span className="block text-[10px] text-[#818d83]">
                        Bill
                      </span>
                      <span
                        className={`mt-0.5 block font-semibold ${
                          isCancelled
                            ? "text-[#9aa39b] line-through"
                            : "text-[#324036]"
                        }`}
                      >
                        {formatMoney(total)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-[#818d83]">
                        Paid now
                      </span>
                      <span className="mt-0.5 block font-semibold text-[#285d42]">
                        {formatMoney(paidNow)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#818d83]">
                        Advance used
                      </span>
                      <span
                        className={`mt-0.5 block font-semibold ${
                          creditUsed > 0 ? "text-sky-700" : "text-[#a7b0a9]"
                        }`}
                      >
                        {creditUsed > 0 ? formatMoney(creditUsed) : "—"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-[#818d83]">
                        Extra → advance
                      </span>
                      <span
                        className={`mt-0.5 block font-semibold ${
                          overpaid > 0 ? "text-sky-700" : "text-[#a7b0a9]"
                        }`}
                      >
                        {overpaid > 0 ? formatMoney(overpaid) : "—"}
                      </span>
                    </div>
                    <div className="col-span-2 border-t border-[#e6ebe3] pt-2">
                      <span className="block text-[10px] text-[#818d83]">
                        Balance
                      </span>
                      <span
                        className={`mt-0.5 block font-bold ${
                          isCancelled
                            ? "text-[#9aa39b]"
                            : balance > 0
                              ? "text-red-600"
                              : overpaid > 0
                                ? "text-sky-700"
                                : "text-emerald-700"
                        }`}
                      >
                        {isCancelled
                          ? "—"
                          : balance > 0
                            ? `Due ${formatMoney(balance)}`
                            : overpaid > 0
                              ? `Advance ${formatMoney(overpaid)}`
                              : creditUsed > 0
                                ? "Settled by advance"
                                : "Settled"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onReceipt(sale)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6eae4] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#55645a]"
                    >
                      <Printer size={13} />
                      Receipt
                    </button>
                    {sale.status === "completed" && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(sale)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6eae4] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#55645a]"
                        >
                          <Edit size={13} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancel(sale)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#f0d9d4] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#b25543]"
                        >
                          <Ban size={13} />
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef0eb] bg-[#fbfcfa] px-5 py-3 text-[11px] text-[#8d968e]">
        <span>
          {filtered.length} sale{filtered.length === 1 ? "" : "s"} · Newest
          first · Cancelled sales do not affect balances or stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#6da57a]" />
          Due = bill − paid now − advance used
        </span>
      </div>
    </section>
  );
}

function ReceiptView({
  sale,
  customer,
  onClose,
}: {
  sale: SaleRecord;
  customer: Customer | undefined;
  onClose: () => void;
}) {
  const total = Number(sale.total_amount);
  const discount = Number(sale.discount_amount);
  const gross = total + discount;
  const overpaid = Number(sale.overpaid_amount);
  const creditUsed = Number(sale.credit_applied ?? 0);
  const paid = Number(sale.amount_paid) + overpaid;
  const balance = Number(sale.balance);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e4e8e1] bg-[#fdfcf8] p-5 font-mono text-[11px] leading-5 text-[#3c463d]">
        <div className="text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-[#29382e]">
            KARUMBU SAKKARAI
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#7d877f]">
            Cane sugar ledger
          </p>
          <p className="mt-1 text-[10px] text-[#8d968e]">
            Receipt #{sale.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="my-3 border-t border-dashed border-[#cfd6cc]" />
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Date</span>
          <span className="font-semibold">{formatDate(sale.sale_date)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Customer</span>
          <span className="text-right font-semibold">
            {customer?.name ?? "Customer"}
          </span>
        </div>
        {customer?.phone && (
          <div className="flex justify-between gap-4">
            <span className="text-[#7d877f]">Phone</span>
            <span>{customer.phone}</span>
          </div>
        )}
        <div className="my-3 border-t border-dashed border-[#cfd6cc]" />
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Items</span>
          <span className="text-right font-semibold">
            {saleItemsLabel(sale)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Rate</span>
          <span>
            {formatMoney(Number(sale.rate_per_unit))}
            {sale.sale_unit === "bulk" ? " / kg" : " each"}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Gross</span>
          <span>{formatMoney(gross)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Discount</span>
          <span>- {formatMoney(discount)}</span>
        </div>
        <div className="my-3 border-t border-dashed border-[#cfd6cc]" />
        <div className="flex justify-between gap-4 text-sm font-bold text-[#29382e]">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Paid</span>
          <span className="font-semibold text-[#285d42]">
            {formatMoney(paid)}
          </span>
        </div>
        {creditUsed > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-[#7d877f]">Advance used</span>
            <span className="font-semibold text-sky-700">
              {formatMoney(creditUsed)}
            </span>
          </div>
        )}
        {overpaid > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-[#7d877f]">Extra paid · advance</span>
            <span className="font-semibold text-[#285d42]">
              {formatMoney(overpaid)}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-4 font-bold">
          <span>Balance</span>
          <span className={balance > 0 ? "text-red-600" : "text-emerald-700"}>
            {formatMoney(balance)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#7d877f]">Payment</span>
          <span className="font-semibold">
            {paymentMethodLabel(sale.payment_method)}
          </span>
        </div>
        {sale.status === "cancelled" && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 py-1 text-center text-[11px] font-bold tracking-[0.18em] text-red-600">
            CANCELLED
          </p>
        )}
        {sale.notes && (
          <p className="mt-3 border-t border-dashed border-[#cfd6cc] pt-2 text-[10px] text-[#7d877f]">
            Note: {sale.notes}
          </p>
        )}
        {sale.status === "cancelled" && sale.cancel_reason && (
          <p className="mt-1 text-[10px] text-[#9a6a60]">
            Cancelled: {sale.cancel_reason}
          </p>
        )}
        <p className="mt-4 text-center text-[10px] text-[#8d968e]">
          Thank you · Simple books. Strong roots.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className={primaryButton}
          onClick={() => printReceipt(sale, customer)}
        >
          <Printer size={15} />
          Print receipt
        </button>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function printReceipt(sale: SaleRecord, customer: Customer | undefined) {
  const total = Number(sale.total_amount);
  const discount = Number(sale.discount_amount);
  const gross = total + discount;
  const overpaid = Number(sale.overpaid_amount);
  const creditUsed = Number(sale.credit_applied ?? 0);
  const paid = Number(sale.amount_paid) + overpaid;
  const balance = Number(sale.balance);
  const receiptNumber = sale.id.slice(0, 8).toUpperCase();
  const windowRef = window.open("", "_blank", "width=420,height=640");
  if (!windowRef) {
    window.alert("Allow pop-ups to print the receipt.");
    return;
  }
  windowRef.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${receiptNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #29382e; font-size: 12px; }
    .receipt { max-width: 360px; margin: 0 auto; }
    .center { text-align: center; }
    .brand { font-size: 16px; font-weight: 700; letter-spacing: 3px; margin: 0; }
    .muted { color: #7d877f; }
    .small { font-size: 10px; }
    .divider { border-top: 1px dashed #b9c2b7; margin: 10px 0; }
    .row { display: flex; justify-content: space-between; gap: 16px; margin: 3px 0; }
    .strong { font-weight: 700; }
    .total { font-size: 15px; font-weight: 700; }
    .cancelled { margin-top: 10px; border: 1px solid #efc4bc; background: #fff4f1; color: #b23b2a; text-align: center; font-weight: 700; letter-spacing: 2px; padding: 4px; }
    .footer { margin-top: 14px; text-align: center; font-size: 10px; color: #7d877f; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <p class="brand">KARUMBU SAKKARAI</p>
      <div class="small muted">Cane sugar ledger</div>
      <div class="small muted">Receipt #${escapeHtml(receiptNumber)}</div>
    </div>
    <div class="divider"></div>
    <div class="row"><span class="muted">Date</span><span class="strong">${escapeHtml(formatDate(sale.sale_date))}</span></div>
    <div class="row"><span class="muted">Customer</span><span class="strong">${escapeHtml(customer?.name ?? "Customer")}</span></div>
    ${customer?.phone ? `<div class="row"><span class="muted">Phone</span><span>${escapeHtml(customer.phone)}</span></div>` : ""}
    <div class="divider"></div>
    <div class="row"><span class="muted">Items</span><span class="strong">${escapeHtml(saleItemsLabel(sale))}</span></div>
    <div class="row"><span class="muted">Rate</span><span>${escapeHtml(formatMoney(Number(sale.rate_per_unit)))}${sale.sale_unit === "bulk" ? " / kg" : " each"}</span></div>
    <div class="row"><span class="muted">Gross</span><span>${escapeHtml(formatMoney(gross))}</span></div>
    <div class="row"><span class="muted">Discount</span><span>- ${escapeHtml(formatMoney(discount))}</span></div>
    <div class="divider"></div>
    <div class="row total"><span>Total</span><span>${escapeHtml(formatMoney(total))}</span></div>
    <div class="row"><span class="muted">Paid</span><span class="strong">${escapeHtml(formatMoney(paid))}</span></div>
    ${creditUsed > 0 ? `<div class="row"><span class="muted">Advance used</span><span class="strong">${escapeHtml(formatMoney(creditUsed))}</span></div>` : ""}
    ${overpaid > 0 ? `<div class="row"><span class="muted">Extra paid · advance</span><span class="strong">${escapeHtml(formatMoney(overpaid))}</span></div>` : ""}
    <div class="row strong"><span>Balance</span><span>${escapeHtml(formatMoney(balance))}</span></div>
    <div class="row"><span class="muted">Payment</span><span class="strong">${escapeHtml(paymentMethodLabel(sale.payment_method))}</span></div>
    ${sale.status === "cancelled" ? `<div class="cancelled">CANCELLED</div>` : ""}
    ${sale.notes ? `<div class="divider"></div><div class="small muted">Note: ${escapeHtml(sale.notes)}</div>` : ""}
    <div class="footer">Thank you · Simple books. Strong roots.</div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  windowRef.document.close();
  windowRef.focus();
}


function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-[520px]",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#18231c]/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`soft-scrollbar max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-[0_25px_80px_rgba(17,35,23,0.2)] sm:rounded-[24px] sm:p-7`}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#829087]">
              Karumbu ledger
            </p>
            <h2
              id="modal-title"
              className="mt-1.5 text-xl font-semibold tracking-[-0.035em] text-[#26372c]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="rounded-lg p-2 text-[#849087] hover:bg-[#f3f5f1]"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function modalTitle(modal: Exclude<ModalKind, null>) {
  switch (modal) {
    case "customer":
      return "Add a customer";
    case "edit-customer":
      return "Edit customer profile";
    case "customer-details":
      return "Customer Details & Ledger";
    case "sale":
      return "Record a daily sale";
    case "edit-sale":
      return "Edit sale";
    case "cancel-sale":
      return "Cancel sale";
    case "receipt":
      return "Sale receipt";
    case "payment":
      return "Record a payment";
    case "ledger":
      return "Customer ledger";
    case "reminder":
      return "WhatsApp payment reminder";
    case "opening-balance":
      return "Opening / previous balance";
    case "stock":
      return "Add stock";
  }
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-[#48574c]">
      {label}
      {required && <span className="ml-1 text-[#ad6a42]">*</span>}
      {children}
    </label>
  );
}

function FormError({ message }: { message: string }) {
  return message ? (
    <div className="rounded-xl border border-[#f0d9d4] bg-[#fff6f3] px-3.5 py-3 text-sm text-[#a64836]">
      {message}
    </div>
  ) : null;
}

function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[#f0d9d4] bg-[#fff6f3] px-3.5 py-3 text-sm leading-5 text-[#a64836]"
    >
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  saving,
  submitLabel,
}: {
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-[#eef0eb] pt-4">
      <button type="button" className={secondaryButton} onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button type="submit" className={primaryButton} disabled={saving}>
        {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
        {saving ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

function CustomerSelect({
  customers,
  selectedId,
  onChange,
  includeBalances = false,
}: {
  customers: Customer[];
  selectedId: string;
  onChange: (id: string) => void;
  includeBalances?: boolean;
}) {
  return (
    <div className="relative mt-1.5">
      <select
        className={`${inputClass} appearance-none pr-10`}
        name="customerId"
        required
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          Select a customer
        </option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
            {includeBalances
              ? customer.pending_balance != null && customer.pending_balance > 0
                ? ` · ${formatMoney(customer.pending_balance)} due`
                : customer.advance_balance != null &&
                    customer.advance_balance > 0
                  ? ` · ${formatMoney(customer.advance_balance)} advance`
                  : " · no due"
              : ""}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#89938b]"
      />
    </div>
  );
}

function SaleForm({
  customers,
  sale,
  saving,
  error,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  customers: Customer[];
  sale?: SaleRecord | null;
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const isEditing = Boolean(sale);
  const [customerId, setCustomerId] = useState(
    sale
      ? sale.customer_id
      : customers.length === 0
        ? "__new_customer__"
        : "",
  );
  const [saleUnit, setSaleUnit] = useState<"500g" | "1kg" | "bulk">(
    sale?.sale_unit ?? "500g",
  );
  const [quantity, setQuantity] = useState(
    sale ? String(Number(sale.sale_quantity)) : "",
  );
  const [price, setPrice] = useState(
    sale ? String(Number(sale.rate_per_unit)) : "",
  );
  const [paid, setPaid] = useState(
    sale
      ? String(Number(sale.amount_paid) + Number(sale.overpaid_amount))
      : "",
  );
  const [discount, setDiscount] = useState(
    sale ? String(Number(sale.discount_amount)) : "",
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">(
    sale?.payment_method ?? "cash",
  );
  const gross =
    Math.round(Number(quantity || 0) * Number(price || 0) * 100) / 100;
  const discountValue = Math.max(0, Number(discount || 0));
  const total = Math.max(0, Math.round((gross - discountValue) * 100) / 100);
  const isNewCustomer = !isEditing && customerId === "__new_customer__";
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId,
  );
  const advanceAvailable = isEditing
    ? 0
    : Math.max(0, selectedCustomer?.advance_balance ?? 0);
  const advanceApplied = Math.min(advanceAvailable, total);
  const payableTotal = Math.max(0, total - advanceApplied);
  const balance = Math.max(0, payableTotal - Number(paid || 0));
  const overpaid = Math.max(0, Number(paid || 0) - payableTotal);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Customer" required>
        {isEditing ? (
          <input
            className={`${inputClass} mt-1.5 bg-[#f5f7f3] text-[#6c796f]`}
            value={selectedCustomer?.name ?? "Customer"}
            disabled
          />
        ) : (
          <div className="relative mt-1.5">
            <select
              className={`${inputClass} appearance-none pr-10`}
              name="customerId"
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="" disabled>
                Select a customer
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
              <option value="__new_customer__">＋ Create new customer</option>
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#89938b]"
            />
          </div>
        )}
      </Field>
      {isNewCustomer && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-dashed border-[#dfe6dc] bg-[#fbfcfa] p-3">
          <Field label="New customer name" required>
            <input
              className={inputClass}
              name="newCustomerName"
              required
              maxLength={120}
              placeholder="Customer name"
            />
          </Field>
          <Field label="Phone number">
            <input
              className={inputClass}
              name="newCustomerPhone"
              type="tel"
              maxLength={30}
              placeholder="+91 98765 43210"
            />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sale date" required>
          <input
            className={inputClass}
            type="date"
            name="saleDate"
            defaultValue={sale?.sale_date ?? today()}
            required
          />
        </Field>
        <Field label="Sale type" required>
          <div className="relative mt-1.5">
            <select
              className={`${inputClass} appearance-none pr-10`}
              name="saleUnit"
              value={saleUnit}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "500g" || value === "1kg" || value === "bulk") {
                  setSaleUnit(value);
                }
              }}
            >
              <option value="500g">500 g packet</option>
              <option value="1kg">1 kg packet</option>
              <option value="bulk">Bulk KG (per kg)</option>
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#89938b]"
            />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={saleUnit === "bulk" ? "Quantity (kg)" : "Quantity (packets)"}
          required
        >
          <input
            className={inputClass}
            type="number"
            name="quantity"
            min={saleUnit === "bulk" ? "0.001" : "1"}
            step={saleUnit === "bulk" ? "0.001" : "1"}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder={saleUnit === "bulk" ? "0.000" : "0"}
          />
        </Field>
        <Field
          label={
            saleUnit === "bulk" ? "Rate per kg (₹)" : "Rate per packet (₹)"
          }
          required
        >
          <input
            className={inputClass}
            type="number"
            name="ratePerUnit"
            min="0.01"
            step="0.01"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Discount (₹)">
          <input
            className={inputClass}
            type="number"
            name="discount"
            min="0"
            max={gross.toFixed(2)}
            step="0.01"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Paid now (₹)">
          <input
            className={inputClass}
            type="number"
            name="amountPaid"
            min="0"
            step="0.01"
            value={paid}
            onChange={(event) => setPaid(event.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7f8b82]">
        <span>Quick payment:</span>
        <button
          type="button"
          onClick={() => setPaid(payableTotal.toFixed(2))}
          className="rounded-md border border-[#dfe6dc] bg-white px-2 py-1 font-semibold text-[#456c4e] hover:bg-[#f3f7f1]"
        >
          Full amount
        </button>
        <button
          type="button"
          onClick={() =>
            setPaid((Math.round(payableTotal * 50) / 100).toFixed(2))
          }
          className="rounded-md border border-[#dfe6dc] bg-white px-2 py-1 font-semibold text-[#6b766d] hover:bg-[#f3f7f1]"
        >
          Half
        </button>
        <button
          type="button"
          onClick={() => setPaid("")}
          className="rounded-md border border-[#dfe6dc] bg-white px-2 py-1 font-semibold text-[#6b766d] hover:bg-[#f3f7f1]"
        >
          No payment
        </button>
      </div>
      {advanceAvailable > 0 && (
        <div className="rounded-lg border border-[#d8e8f2] bg-[#f4fafd] px-3 py-2 text-[11px] font-medium leading-4 text-sky-700">
          {advanceApplied > 0
            ? `${formatMoney(advanceApplied)} of this customer's advance will be used automatically. Collect only ${formatMoney(payableTotal)} in cash/UPI.`
            : `This customer has ${formatMoney(advanceAvailable)} advance credit available for this sale.`}
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-[#48574c]">Payment method</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(["cash", "upi"] as const).map((method) => {
            const active = paymentMethod === method;
            return (
              <button
                key={method}
                type="button"
                aria-pressed={active}
                onClick={() => setPaymentMethod(method)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-[#8eae94] bg-[#edf4eb] text-[#285d42] ring-2 ring-[#e7f0e7]"
                    : "border-[#e2e6df] bg-white text-[#6c796f] hover:bg-[#f7f9f5]"
                }`}
              >
                {method === "cash" ? (
                  <Banknote size={16} />
                ) : (
                  <IndianRupee size={16} />
                )}
                {method === "cash" ? "Cash" : "UPI"}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="paymentMethod" value={paymentMethod} />
      </div>

      <div className="rounded-xl border border-[#e8eee6] bg-[#f7faf6] p-4 text-sm">
        <div className="flex items-center justify-between text-[#6c796f]">
          <span>Gross bill</span>
          <span className="font-semibold text-[#35483a]">
            {formatMoney(gross)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[#6c796f]">
          <span>Discount</span>
          <span className="font-semibold text-[#9a6133]">
            − {formatMoney(Math.min(discountValue, gross))}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-[#e7ede5] pt-2 text-[#35483a]">
          <span className="font-semibold">Net total</span>
          <span className="text-base font-bold">{formatMoney(total)}</span>
        </div>
        {advanceApplied > 0 && (
          <>
            <div className="mt-2 flex items-center justify-between text-sky-700">
              <span>Advance applied</span>
              <span className="font-semibold">
                − {formatMoney(advanceApplied)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[#35483a]">
              <span className="font-semibold">Amount payable</span>
              <span className="font-bold">{formatMoney(payableTotal)}</span>
            </div>
          </>
        )}
        <div className="mt-2 flex items-center justify-between text-[#6c796f]">
          <span>Paid now</span>
          <span className="font-semibold text-[#285d42]">
            {formatMoney(Number(paid || 0))}
          </span>
        </div>
        {overpaid > 0 && (
          <div className="mt-2 flex items-center justify-between text-[#285d42]">
            <span>Extra paid · customer advance</span>
            <span className="font-semibold">{formatMoney(overpaid)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-[#e7ede5] pt-2">
          <span className="text-[#6c796f]">
            {balance > 0
              ? Number(paid || 0) <= 0
                ? "Full amount added to balance"
                : "Remaining added to balance"
              : overpaid > 0
                ? "Extra kept as customer advance"
                : advanceApplied >= total && total > 0
                  ? "Fully covered by customer advance"
                  : "Fully paid"}
          </span>
          <span className="font-semibold text-[#9a6133]">
            {formatMoney(balance)}
          </span>
        </div>
      </div>

      <Field label="Notes">
        <input
          className={inputClass}
          name="notes"
          maxLength={500}
          defaultValue={sale?.notes ?? ""}
          placeholder="Optional sale note"
        />
      </Field>
      <FormError message={error} />
      <ModalActions
        onCancel={onCancel}
        saving={saving}
        submitLabel={submitLabel ?? "Save sale"}
      />
    </form>
  );
}


function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function PaymentsDueLedgerPage({
  customers,
  summary,
  loading,
  stale,
  error,
  onRefresh,
  onReceivePayment,
  onViewLedger,
  onViewPurchases,
  onReminder,
  onOpeningBalance,
}: {
  customers: Customer[];
  summary: CustomerSummaryResult | null;
  loading: boolean;
  stale: boolean;
  error: string;
  onRefresh: () => void;
  onReceivePayment: (customer: Customer) => void;
  onViewLedger: (customer: Customer) => void;
  onViewPurchases: (customer: Customer) => void;
  onReminder: (customer: Customer) => void;
  onOpeningBalance: (customer?: Customer) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "all" | "due" | "settled" | "advance"
  >("due");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<"outstanding" | "name" | "recent">(
    "outstanding",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [search, status, fromDate, toDate, sort, pageSize]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers
      .filter((customer) => {
        if (
          query &&
          ![customer.name, customer.phone ?? "", customer.address ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(query)
        ) {
          return false;
        }
        const due = customer.pending_balance ?? 0;
        const advance = customer.advance_balance ?? 0;
        if (status === "due" && due <= 0) return false;
        if (status === "advance" && advance <= 0) return false;
        if (
          status === "settled" &&
          (due > 0 ||
            advance > 0 ||
            (customer.total_billed ?? 0) +
              (customer.opening_balance ?? 0) +
              (customer.total_paid ?? 0) <=
              0)
        ) {
          return false;
        }
        const lastDate = customer.last_payment_date;
        if (fromDate && (!lastDate || lastDate < fromDate)) return false;
        if (toDate && (!lastDate || lastDate > toDate)) return false;
        return true;
      })
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name);
        if (sort === "recent") {
          return (right.last_payment_date ?? "").localeCompare(
            left.last_payment_date ?? "",
          );
        }
        return (
          (right.pending_balance ?? 0) - (left.pending_balance ?? 0) ||
          left.name.localeCompare(right.name)
        );
      });
  }, [customers, search, status, fromDate, toDate, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const dueTotal = filtered.reduce(
    (sum, customer) => sum + (customer.pending_balance ?? 0),
    0,
  );
  const advanceTotal = filtered.reduce(
    (sum, customer) => sum + (customer.advance_balance ?? 0),
    0,
  );

  const exportDues = () =>
    downloadCsv(
      `customer-dues-${today()}.csv`,
      [
        "Customer name",
        "Phone",
        "Opening balance",
        "Total purchases",
        "Total payments received",
        "Advance adjustments",
        "Outstanding due",
        "Available advance",
        "Last payment date",
      ],
      filtered.map((customer) => [
        customer.name,
        customer.phone,
        customer.opening_balance,
        customer.total_billed,
        customer.total_paid,
        customer.advance_adjustments,
        customer.pending_balance,
        customer.advance_balance,
        customer.last_payment_date,
      ]),
    );

  return (
    <section className="mt-8 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Total Outstanding Due"
          value={formatMetric(summary?.outstanding, loading, stale)}
          detail="All customers, including opening balances"
          icon={<IndianRupee size={19} />}
          accent="red"
        />
        <SummaryCard
          label="Collected Today"
          value={formatMetric(summary?.collectedToday, loading, stale)}
          detail="Cash/UPI/bank payments received today"
          icon={<Banknote size={19} />}
          accent="emerald"
        />
        <SummaryCard
          label="Collected This Month"
          value={formatMetric(summary?.collectedThisMonth, loading, stale)}
          detail="Sale-time plus standalone collections"
          icon={<Calendar size={19} />}
          accent="green"
        />
        <SummaryCard
          label="Available Customer Advance"
          value={formatMetric(summary?.totalAdvance, loading, stale)}
          detail="Credit available for future purchases"
          icon={<Wallet size={19} />}
          accent="green"
        />
        <SummaryCard
          label="Customers With Dues"
          value={
            loading
              ? "Refreshing…"
              : stale || summary?.dueCustomerCount == null
                ? "Unavailable"
                : summary.dueCustomerCount.toLocaleString("en-IN")
          }
          detail={`${filtered.length} customer${filtered.length === 1 ? "" : "s"} in this view`}
          icon={<Users size={19} />}
          accent="amber"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8ece5] bg-white shadow-[0_2px_8px_rgba(24,40,30,0.03)]">
        <div className="flex flex-col gap-4 border-b border-[#eef0eb] px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#29382e]">
                Customer-wise outstanding dues
              </h3>
              <span className="rounded-full bg-[#edf4eb] px-2 py-0.5 text-[10px] font-semibold text-[#456c4e]">
                Live ledger balances
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#838c85]">
              Opening balances are previous dues, not sales. Payments settle
              dues first; any excess becomes available advance. Advance
              adjustments are shown separately and never counted as new cash.
            </p>
            <p className="mt-1 text-[11px] text-[#8d968e]">
              Filtered totals: {formatMoney(dueTotal)} due ·{" "}
              {formatMoney(advanceTotal)} advance
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={exportDues}
              disabled={filtered.length === 0}
            >
              <Download size={15} />
              Export CSV
            </button>
            <button
              type="button"
              className={primaryButton}
              onClick={() => onOpeningBalance()}
            >
              <Plus size={15} />
              Opening balance
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-[#eef0eb] bg-[#fbfcfa] px-5 py-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#959d96]"
            />
            <input
              className="h-10 w-full rounded-xl border border-[#e4e8e1] bg-white pl-10 pr-3 text-sm outline-none placeholder:text-[#a0a79f] focus:border-[#9ab59e] focus:ring-2 focus:ring-[#e7f0e7]"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer name or phone…"
            />
          </div>
          <select
            className="h-10 rounded-xl border border-[#e4e8e1] bg-white px-3 text-xs font-medium text-[#526157] outline-none focus:border-[#9ab59e]"
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as "all" | "due" | "settled" | "advance",
              )
            }
          >
            <option value="all">All balances</option>
            <option value="due">Outstanding dues</option>
            <option value="settled">Fully paid</option>
            <option value="advance">Advance balance</option>
          </select>
          <select
            className="h-10 rounded-xl border border-[#e4e8e1] bg-white px-3 text-xs font-medium text-[#526157] outline-none focus:border-[#9ab59e]"
            value={sort}
            onChange={(event) =>
              setSort(
                event.target.value as "outstanding" | "name" | "recent",
              )
            }
          >
            <option value="outstanding">Highest outstanding</option>
            <option value="recent">Last payment (newest)</option>
            <option value="name">Customer name</option>
          </select>
          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#8d968e]">
              Last payment date
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="Last payment from date"
                className="h-10 min-w-0 rounded-xl border border-[#e4e8e1] bg-white px-2 text-[11px] text-[#526157] outline-none focus:border-[#9ab59e]"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
              <input
                type="date"
                aria-label="Last payment to date"
                className="h-10 min-w-0 rounded-xl border border-[#e4e8e1] bg-white px-2 text-[11px] text-[#526157] outline-none focus:border-[#9ab59e]"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0d9d4] bg-[#fff6f3] px-5 py-3 text-xs text-[#a64836]">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRefresh}
              className="font-semibold underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}
        {summary?.warning && summary.warning !== error && (
          <div className="border-b border-[#f0d9d4] bg-[#fff6f3] px-5 py-3 text-xs text-[#a64836]">
            {summary.warning}
          </div>
        )}

        {loading && !summary ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#7c867e]">
            <LoaderCircle size={17} className="animate-spin" />
            Loading customer dues…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <HandCoins className="mx-auto text-[#8ca18d]" size={26} />
            <p className="mt-3 text-sm font-semibold text-[#405046]">
              No customers match this view
            </p>
            <p className="mt-1 text-xs text-[#8a938c]">
              Change the search, balance type, or payment date range.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[1180px] text-left text-xs">
                <thead className="border-b border-[#eef0eb] bg-white text-[10px] font-semibold uppercase tracking-[0.1em] text-[#919a92]">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-3 py-3 text-right">Opening balance</th>
                    <th className="px-3 py-3 text-right">Total purchases</th>
                    <th className="px-3 py-3 text-right">Payments received</th>
                    <th className="px-3 py-3 text-right">Advance used</th>
                    <th className="px-3 py-3 text-right">Outstanding due</th>
                    <th className="px-3 py-3 text-right">Available advance</th>
                    <th className="px-3 py-3">Last payment</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0eb]">
                  {paginated.map((customer) => {
                    const due = customer.pending_balance ?? 0;
                    const advance = customer.advance_balance ?? 0;
                    return (
                      <tr key={customer.id} className="hover:bg-[#fafbf9]">
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => onViewLedger(customer)}
                          >
                            <span className="block text-sm font-semibold text-[#29382e] hover:text-[#285d42]">
                              {customer.name}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-[#8e9891]">
                              {customer.phone || "No phone saved"}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <button
                            type="button"
                            title="Set or correct opening balance"
                            onClick={() => onOpeningBalance(customer)}
                            className="rounded-md px-1.5 py-0.5 font-medium text-[#8b6139] hover:bg-[#f8f1e7]"
                          >
                            {formatMoney(customer.opening_balance ?? 0)}
                          </button>
                        </td>
                        <td className="px-3 py-3.5 text-right font-medium text-[#405046]">
                          {formatMoney(customer.total_billed ?? 0)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-medium text-[#285d42]">
                          {formatMoney(customer.total_paid ?? 0)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-medium text-sky-700">
                          {formatMoney(customer.advance_adjustments ?? 0)}
                        </td>
                        <td
                          className={`px-3 py-3.5 text-right text-sm font-bold ${
                            due > 0 ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {formatMoney(due)}
                        </td>
                        <td
                          className={`px-3 py-3.5 text-right text-sm font-bold ${
                            advance > 0 ? "text-sky-700" : "text-[#8d968e]"
                          }`}
                        >
                          {formatMoney(advance)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-[11px] text-[#69766c]">
                          {customer.last_payment_date
                            ? formatDate(customer.last_payment_date)
                            : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="View customer ledger"
                              aria-label={`View ${customer.name} ledger`}
                              className="rounded-lg border border-[#e6eae4] bg-white p-1.5 text-[#627067] hover:bg-[#f3f6f1]"
                              onClick={() => onViewLedger(customer)}
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              title="Receive payment"
                              aria-label={`Receive payment from ${customer.name}`}
                              className="rounded-lg border border-[#d8e5d6] bg-[#f4f9f2] p-1.5 text-[#356347] hover:bg-[#eaf4e7]"
                              onClick={() => onReceivePayment(customer)}
                            >
                              <Banknote size={14} />
                            </button>
                            <button
                              type="button"
                              title="View purchase history"
                              aria-label={`View ${customer.name} purchases`}
                              className="rounded-lg border border-[#e6eae4] bg-white p-1.5 text-[#627067] hover:bg-[#f3f6f1]"
                              onClick={() => onViewPurchases(customer)}
                            >
                              <ShoppingBag size={14} />
                            </button>
                            <button
                              type="button"
                              title={
                                due > 0
                                  ? "Send WhatsApp payment reminder"
                                  : "No outstanding due to remind"
                              }
                              aria-label={`WhatsApp reminder for ${customer.name}`}
                              disabled={due <= 0}
                              className="rounded-lg border border-[#d8e5d6] bg-white p-1.5 text-[#28734b] hover:bg-[#eef7ec] disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => onReminder(customer)}
                            >
                              <MessageCircle size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[#eef0eb] xl:hidden">
              {paginated.map((customer) => {
                const due = customer.pending_balance ?? 0;
                const advance = customer.advance_balance ?? 0;
                return (
                  <li key={customer.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#29382e]">
                          {customer.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#8e9891]">
                          {customer.phone || "No phone saved"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-sm font-bold ${
                            due > 0 ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          Due {formatMoney(due)}
                        </p>
                        {advance > 0 && (
                          <p className="mt-0.5 text-[11px] font-semibold text-sky-700">
                            + {formatMoney(advance)} advance
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#f8faf7] p-2.5 text-[11px]">
                      <div>
                        <span className="block text-[10px] text-[#818d83]">
                          Opening
                        </span>
                        <span className="font-semibold text-[#8b6139]">
                          {formatMoney(customer.opening_balance ?? 0)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-[#818d83]">
                          Purchases
                        </span>
                        <span className="font-semibold text-[#405046]">
                          {formatMoney(customer.total_billed ?? 0)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#818d83]">
                          Payments received
                        </span>
                        <span className="font-semibold text-[#285d42]">
                          {formatMoney(customer.total_paid ?? 0)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-[#818d83]">
                          Advance used
                        </span>
                        <span className="font-semibold text-sky-700">
                          {formatMoney(customer.advance_adjustments ?? 0)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7f8981]">
                      <span>
                        Last payment:{" "}
                        {customer.last_payment_date
                          ? formatDate(customer.last_payment_date)
                          : "—"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-[#e6eae4] bg-white px-2 py-1.5 font-semibold text-[#55645a]"
                          onClick={() => onViewLedger(customer)}
                        >
                          Ledger
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[#d8e5d6] bg-[#f4f9f2] px-2 py-1.5 font-semibold text-[#356347]"
                          onClick={() => onReceivePayment(customer)}
                        >
                          Pay
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[#e6eae4] bg-white p-1.5 text-[#627067]"
                          title="View purchase history"
                          onClick={() => onViewPurchases(customer)}
                        >
                          <ShoppingBag size={13} />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[#d8e5d6] bg-white p-1.5 text-[#28734b] disabled:opacity-40"
                          disabled={due <= 0}
                          title="Send WhatsApp reminder"
                          onClick={() => onReminder(customer)}
                        >
                          <MessageCircle size={13} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0eb] bg-[#fbfcfa] px-5 py-3 text-[11px] text-[#8d968e]">
          <span>
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            –{Math.min(currentPage * pageSize, filtered.length)} of{" "}
            {filtered.length} customers
          </span>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-lg border border-[#e2e6df] bg-white px-2 text-[11px]"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
            <button
              type="button"
              className={secondaryButton}
              disabled={currentPage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span className="font-semibold text-[#5b665e]">
              {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              className={secondaryButton}
              disabled={currentPage >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function OpeningBalanceForm({
  customers,
  saving,
  error,
  onSubmit,
  onCancel,
  initialCustomerId,
}: {
  customers: Customer[];
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  initialCustomerId: string;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const customer = customers.find((item) => item.id === customerId);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-xl border border-[#f0e4d2] bg-[#fffaf2] px-3.5 py-3 text-[11px] leading-5 text-[#8a6137]">
        Opening balance is for money owed from purchases made before this
        system. It is recorded once per customer and is <strong>not</strong> a
        sale or a new payment. Saving again corrects the existing opening
        balance and keeps an audit trail.
      </div>
      <Field label="Customer" required>
        <CustomerSelect
          customers={customers}
          selectedId={customerId}
          onChange={setCustomerId}
          includeBalances
        />
      </Field>
      {customer && (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#f6f8f4] px-3.5 py-3 text-xs">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-[#818d83]">
              Existing opening
            </span>
            <span className="mt-1 block font-semibold text-[#8b6139]">
              {formatOptionalMoney(customer.opening_balance)}
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wider text-[#818d83]">
              Current outstanding
            </span>
            <span className="mt-1 block font-semibold text-red-600">
              {formatOptionalMoney(customer.pending_balance)}
            </span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance (₹)" required>
          <input
            key={customerId}
            className={inputClass}
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={customer?.opening_balance ?? ""}
            placeholder="0.00"
          />
        </Field>
        <Field label="Effective date" required>
          <input
            className={inputClass}
            name="effectiveDate"
            type="date"
            required
            defaultValue={today()}
          />
        </Field>
      </div>
      <Field label="Notes / reason">
        <input
          className={inputClass}
          name="notes"
          maxLength={500}
          defaultValue=""
          placeholder="Example: Dues carried forward from old notebook"
        />
      </Field>
      <FormError message={error} />
      <ModalActions
        onCancel={onCancel}
        saving={saving}
        submitLabel="Save opening balance"
      />
    </form>
  );
}

function ReminderModal({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const phone = safeWhatsAppPhone(customer.phone);
  const due = Math.max(0, customer.pending_balance ?? 0);
  const [language, setLanguage] = useState<"ta" | "en">(() => {
    if (typeof window === "undefined") return "ta";
    return window.localStorage.getItem("reminder-language") === "en"
      ? "en"
      : "ta";
  });
  const defaultMessage =
    language === "ta"
      ? `Vanakkam ${customer.name},\n\nUngal Karumbu Sakkarai account-la ${formatMoney(due)} pending balance irukku.\n\nUngalukku vasadhiyaana nerathula payment settle pannunga.\n\nThank you!`
      : `Hello ${customer.name},\n\nYour Karumbu Sakkarai account has a pending balance of ${formatMoney(due)}.\n\nPlease settle the payment at your convenience.\n\nThank you!`;
  const [message, setMessage] = useState(defaultMessage);

  function changeLanguage(next: "ta" | "en") {
    setLanguage(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("reminder-language", next);
    }
    setMessage(
      next === "ta"
        ? `Vanakkam ${customer.name},\n\nUngal Karumbu Sakkarai account-la ${formatMoney(due)} pending balance irukku.\n\nUngalukku vasadhiyaana nerathula payment settle pannunga.\n\nThank you!`
        : `Hello ${customer.name},\n\nYour Karumbu Sakkarai account has a pending balance of ${formatMoney(due)}.\n\nPlease settle the payment at your convenience.\n\nThank you!`,
    );
  }

  const whatsappHref = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e4e9e1] bg-[#f8faf7] p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-[#29382e]">{customer.name}</p>
            <p className="mt-0.5 text-xs text-[#7f8981]">
              {customer.phone || "No phone number saved"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-[#818d83]">
              Outstanding due
            </p>
            <p className="mt-0.5 font-bold text-red-600">{formatMoney(due)}</p>
          </div>
        </div>
      </div>
      {due <= 0 && (
        <ErrorNotice>
          This customer has no outstanding due. Payment reminders are only
          available when an amount is pending.
        </ErrorNotice>
      )}
      {!phone && (
        <ErrorNotice>
          Add a valid phone number to this customer before creating a WhatsApp
          reminder.
        </ErrorNotice>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#48574c]">Reminder language</p>
        <div className="flex rounded-xl border border-[#e2e6df] bg-white p-1">
          {(
            [
              ["ta", "தமிழ்"],
              ["en", "English"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => changeLanguage(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                language === value
                  ? "bg-[#edf4eb] text-[#285d42]"
                  : "text-[#717b74]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Message (edit before opening WhatsApp)">
        <textarea
          className={`${inputClass} h-40 resize-none py-3`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1200}
        />
      </Field>
      <p className="rounded-lg border border-dashed border-[#dce5da] bg-[#fbfcfa] px-3 py-2 text-[11px] leading-4 text-[#77857a]">
        This opens WhatsApp with a prepared message. Nothing is sent
        automatically — review the message and press send inside WhatsApp.
      </p>
      <div className="flex flex-col-reverse gap-2 border-t border-[#eef0eb] pt-4 sm:flex-row sm:justify-end">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Close
        </button>
        {whatsappHref && due > 0 ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={primaryButton}
          >
            <MessageCircle size={15} />
            Open WhatsApp
          </a>
        ) : (
          <button type="button" className={primaryButton} disabled>
            <MessageCircle size={15} />
            Open WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}

function PaymentForm({
  customers,
  saving,
  error,
  onSubmit,
  onCancel,
  initialCustomerId,
}: {
  customers: Customer[];
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  initialCustomerId: string;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const customer = customers.find((item) => item.id === customerId);
  const pendingDue = Math.max(0, customer?.pending_balance ?? 0);
  const currentAdvance = Math.max(0, customer?.advance_balance ?? 0);
  const paymentAmount = Math.max(0, Number(amount || 0));
  const appliedToDue = Math.min(paymentAmount, pendingDue);
  const remainingDue = Math.max(0, pendingDue - paymentAmount);
  const advanceAdded =
    Math.round(Math.max(0, paymentAmount - pendingDue) * 100) / 100;
  const advanceAfter = currentAdvance + advanceAdded;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {customers.length === 0 && (
        <ErrorNotice>Add a customer before recording a payment.</ErrorNotice>
      )}
      <Field label="Customer" required>
        <CustomerSelect
          customers={customers}
          selectedId={customerId}
          onChange={setCustomerId}
          includeBalances
        />
      </Field>
      {customer && (
        <div className="space-y-2 rounded-xl bg-[#f6f8f4] px-3.5 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#748077]">Customer</span>
            <span className="font-semibold text-[#405046]">
              {customer.name}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#e5eae2] pt-2">
            <span className="text-[#748077]">Phone</span>
            <span className="font-medium text-[#59685d]">
              {customer.phone || "Not saved"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#e5eae2] pt-2">
            <span className="text-[#748077]">Current outstanding due</span>
            <span className="font-semibold text-[#8b6139]">
              {formatOptionalMoney(customer.pending_balance)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#e5eae2] pt-2">
            <span className="text-[#748077]">Current available advance</span>
            <span className="font-semibold text-sky-700">
              {formatMoney(currentAdvance)}
            </span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Payment date & time" required>
          <input
            className={inputClass}
            type="datetime-local"
            name="paidAt"
            defaultValue={localDateTimeInputValue()}
            required
          />
        </Field>
        <Field label="Payment amount (₹)" required>
          <input
            className={inputClass}
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div>
        <p className="text-sm font-medium text-[#48574c]">Payment method</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(
            [
              ["cash", "Cash"],
              ["upi", "UPI"],
              ["bank", "Bank transfer"],
              ["other", "Other"],
            ] as const
          ).map(([method, label]) => {
            const active = paymentMethod === method;
            return (
              <button
                key={method}
                type="button"
                aria-pressed={active}
                onClick={() => setPaymentMethod(method)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "border-[#8eae94] bg-[#edf4eb] text-[#285d42] ring-2 ring-[#e7f0e7]"
                    : "border-[#e2e6df] bg-white text-[#6c796f] hover:bg-[#f7f9f5]"
                }`}
              >
                {method === "cash" ? (
                  <Banknote size={15} />
                ) : method === "upi" ? (
                  <IndianRupee size={15} />
                ) : (
                  <HandCoins size={15} />
                )}
                {label}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="paymentMethod" value={paymentMethod} />
      </div>
      <Field label="Reference / transaction ID">
        <input
          className={inputClass}
          name="reference"
          maxLength={160}
          placeholder="UPI reference, bank reference, receipt number (optional)"
        />
      </Field>
      <div className="rounded-xl border border-[#e8eee6] bg-[#f7faf6] p-4 text-sm">
        <div className="flex items-center justify-between text-[#6c796f]">
          <span>Payment received</span>
          <span className="font-semibold text-[#285d42]">
            {formatMoney(paymentAmount)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[#6c796f]">
          <span>Applied to outstanding due</span>
          <span className="font-semibold text-[#8b6139]">
            {formatMoney(appliedToDue)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[#6c796f]">
          <span>Remaining due after payment</span>
          <span
            className={`font-semibold ${
              remainingDue > 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {formatMoney(remainingDue)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-[#e7ede5] pt-2 text-[#6c796f]">
          <span>Added to advance</span>
          <span className="font-semibold text-sky-700">
            {formatMoney(advanceAdded)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[#6c796f]">
          <span>Advance balance after payment</span>
          <span className="font-semibold text-sky-700">
            {formatMoney(advanceAfter)}
          </span>
        </div>
      </div>
      <p className="rounded-lg border border-dashed border-[#dce5da] bg-[#fbfcfa] px-3 py-2 text-[11px] leading-4 text-[#77857a]">
        Payments settle outstanding dues first. Any excess is saved as customer
        advance and automatically adjusted on the next sale. A payment does not
        create a sale.
      </p>
      <Field label="Notes">
        <input
          className={inputClass}
          name="notes"
          maxLength={500}
          placeholder="Optional payment note"
        />
      </Field>
      <FormError message={error} />
      <ModalActions
        onCancel={onCancel}
        saving={saving}
        submitLabel="Save payment"
      />
    </form>
  );
}

function LedgerView({
  customer,
  entries,
  loading,
  error,
  initialKind,
  onReceivePayment,
  onReminder,
}: {
  customer: Customer;
  entries: LedgerEntry[];
  loading: boolean;
  error: string;
  initialKind: "all" | "sale" | "payment" | "opening";
  onReceivePayment: () => void;
  onReminder: () => void;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [kindFilter, setKindFilter] = useState<
    "all" | "sale" | "payment" | "opening"
  >(initialKind);
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [search, setSearch] = useState("");
  const hasAdvance =
    customer.advance_balance !== null && customer.advance_balance > 0;
  const hasDue =
    customer.pending_balance !== null && customer.pending_balance > 0;
  const balancesById = new Map<string, number>();
  const chronological = [...entries].reverse();
  let runningBalance = 0;
  for (const entry of chronological) {
    runningBalance += entry.debit - entry.credit;
    balancesById.set(`${entry.kind}-${entry.id}`, runningBalance);
  }

  const filteredEntries = entries.filter((entry) => {
    if (kindFilter !== "all" && entry.kind !== kindFilter) return false;
    if (methodFilter !== "all" && entry.payment_method !== methodFilter) {
      return false;
    }
    if (fromDate && entry.date < fromDate) return false;
    if (toDate && entry.date > toDate) return false;
    const query = search.trim().toLowerCase();
    if (
      query &&
      ![
        entry.description,
        entry.reference ?? "",
        entry.id,
        customer.name,
        entry.payment_method ? paymentMethodLabel(entry.payment_method) : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    return true;
  });

  const entryTypeLabel = (entry: LedgerEntry) => {
    if (entry.kind === "opening") return "Opening balance";
    if (entry.kind === "sale") {
      if (entry.credit_applied > 0) return "Advance adjusted against sale";
      if (entry.overpaid_amount > 0) return "Advance received";
      if (entry.credit >= entry.debit) return "Full payment";
      if (entry.credit > 0) return "Partial payment";
      return "Sale";
    }
    return "Payment received";
  };

  const entryTime = (entry: LedgerEntry) =>
    new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(entry.paid_at));

  const exportLedger = () =>
    downloadCsv(
      `ledger-${customer.name.replace(/[^a-z0-9]+/gi, "-")}-${today()}.csv`,
      [
        "Date",
        "Time",
        "Transaction ID",
        "Transaction type",
        "Description",
        "Sale / payment reference",
        "Payment method",
        "Debit",
        "Credit",
        "Running balance",
      ],
      filteredEntries.map((entry) => [
        entry.date,
        entryTime(entry),
        entry.id,
        entryTypeLabel(entry),
        entry.description,
        entry.kind === "sale" ? entry.id : entry.reference,
        entry.payment_method ? paymentMethodLabel(entry.payment_method) : "",
        entry.debit || "",
        entry.credit || "",
        balancesById.get(`${entry.kind}-${entry.id}`) ?? 0,
      ]),
    );

  const printLedger = () => {
    const printWindow = window.open("", "_blank", "width=900,height=720");
    if (!printWindow) return;
    const rows = filteredEntries
      .map((entry) => {
        const balance = balancesById.get(`${entry.kind}-${entry.id}`) ?? 0;
        return `<tr>
          <td>${escapeHtml(formatDate(entry.date))}<br><span class="muted">${escapeHtml(entryTime(entry))}</span></td>
          <td>${escapeHtml(entryTypeLabel(entry))}<br><span class="muted">${escapeHtml(entry.description)}</span></td>
          <td>${escapeHtml(entry.reference || (entry.kind === "sale" ? entry.id.slice(0, 8) : "—"))}</td>
          <td>${entry.payment_method ? escapeHtml(paymentMethodLabel(entry.payment_method)) : "—"}</td>
          <td class="num">${entry.debit ? escapeHtml(formatMoney(entry.debit)) : "—"}</td>
          <td class="num">${entry.credit ? escapeHtml(formatMoney(entry.credit)) : "—"}</td>
          <td class="num strong ${balance > 0 ? "due" : balance < 0 ? "advance" : ""}">${escapeHtml(formatSignedBalance(balance))}</td>
        </tr>`;
      })
      .join("");
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ledger - ${escapeHtml(customer.name)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#25372c;padding:24px;font-size:12px}
        h1{font-size:20px;margin:0}.muted{color:#7f8981;font-size:10px}
        .meta{color:#68756b;margin:4px 0 16px}.sum{margin:12px 0;font-weight:700}
        table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e3e8df;padding:7px 6px;text-align:left;vertical-align:top}
        th{background:#f5f8f3;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#68756b}
        .num{text-align:right}.strong{font-weight:700}.due{color:#b43d2f}.advance{color:#1d76a5}
        .legend{margin-top:14px;color:#68756b;font-size:10px}.print{margin-top:18px;font-size:11px}
        @media print{button{display:none}}
      </style></head><body>
      <h1>Karumbu Sakkarai · Customer Ledger</h1>
      <div class="meta">${escapeHtml(customer.name)} · ${escapeHtml(customer.phone || "No phone")} · Generated ${escapeHtml(new Date().toLocaleString("en-IN"))}</div>
      <div class="sum">Outstanding due: ${escapeHtml(formatMoney(customer.pending_balance ?? 0))} &nbsp; | &nbsp; Available advance: ${escapeHtml(formatMoney(customer.advance_balance ?? 0))}</div>
      <table><thead><tr><th>Date</th><th>Transaction</th><th>Reference</th><th>Method</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Running balance</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="legend">Debit increases what the customer owes. Credit reduces dues first and then becomes advance. Balance shows − for due and + for advance.</div>
      <div class="print"><button onclick="window.print()">Print this ledger</button></div>
      </body></html>`);
    printWindow.document.close();
    printWindow.focus();
  };

  const totalDebit = filteredEntries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = filteredEntries.reduce((sum, entry) => sum + entry.credit, 0);

  return (
    <div>
      <div className="mb-5 flex flex-col justify-between gap-4 rounded-2xl bg-[#f5f8f3] p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#52755a] shadow-sm">
            {customer.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#2d3d32]">
              {customer.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-[#849087]">
              {customer.phone || customer.address || "Customer account"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-5 text-right">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#849087]">
              Due
            </p>
            <p className={`mt-1 text-sm font-bold ${hasDue ? "text-red-600" : "text-emerald-700"}`}>
              {formatMoney(customer.pending_balance ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#849087]">
              Advance
            </p>
            <p className={`mt-1 text-sm font-bold ${hasAdvance ? "text-sky-700" : "text-[#8d968e]"}`}>
              {formatMoney(customer.advance_balance ?? 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={customer.pending_balance === null}
          onClick={onReceivePayment}
        >
          <Banknote size={16} />
          Receive payment / advance
        </button>
        <button
          type="button"
          className={`${secondaryButton} text-[#28734b]`}
          disabled={!hasDue || !safeWhatsAppPhone(customer.phone)}
          title={
            hasDue
              ? "Review and open WhatsApp reminder"
              : "No outstanding due to remind"
          }
          onClick={onReminder}
        >
          <MessageCircle size={16} />
          WhatsApp reminder
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={printLedger}
          disabled={filteredEntries.length === 0}
        >
          <Printer size={16} />
          Print
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={exportLedger}
          disabled={filteredEntries.length === 0}
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-[#e8ece5] bg-[#fbfcfa] p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#959d96]"
          />
          <input
            className="h-9 w-full rounded-lg border border-[#e2e6df] bg-white pl-8 pr-3 text-xs outline-none focus:border-[#9ab59e]"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reference, description, or transaction ID…"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            aria-label="Ledger from date"
            className="h-9 min-w-0 rounded-lg border border-[#e2e6df] bg-white px-2 text-[11px] text-[#526157]"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <input
            type="date"
            aria-label="Ledger to date"
            className="h-9 min-w-0 rounded-lg border border-[#e2e6df] bg-white px-2 text-[11px] text-[#526157]"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-9 rounded-lg border border-[#e2e6df] bg-white px-2 text-[11px] text-[#526157]"
            value={kindFilter}
            onChange={(event) =>
              setKindFilter(
                event.target.value as "all" | "sale" | "payment" | "opening",
              )
            }
          >
            <option value="all">All types</option>
            <option value="sale">Sales</option>
            <option value="payment">Payments</option>
            <option value="opening">Opening balance</option>
          </select>
          <select
            className="h-9 rounded-lg border border-[#e2e6df] bg-white px-2 text-[11px] text-[#526157]"
            value={methodFilter}
            onChange={(event) =>
              setMethodFilter(event.target.value as "all" | PaymentMethod)
            }
          >
            <option value="all">All methods</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <FormError message={error} />
      <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#7f8981]">
        <span>Debit = amount added to due</span>
        <span className="text-[#c2c9c1]">·</span>
        <span>Credit = payment received</span>
        <span className="text-[#c2c9c1]">·</span>
        <span><strong className="text-red-600">−</strong> due balance</span>
        <span className="text-[#c2c9c1]">·</span>
        <span><strong className="text-sky-700">+</strong> advance balance</span>
      </p>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#7c867e]">
          <LoaderCircle size={17} className="animate-spin" />
          Loading ledger…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#dfe5dc] px-4 py-10 text-center">
          <ShoppingBag className="mx-auto text-[#8ca18d]" size={22} />
          <p className="mt-3 text-sm font-semibold text-[#405046]">
            No transactions yet
          </p>
          <p className="mt-1 text-xs text-[#8a938c]">
            Sales, opening balances, and payments for this customer will appear
            here.
          </p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#dfe5dc] px-4 py-10 text-center">
          <Search className="mx-auto text-[#8ca18d]" size={22} />
          <p className="mt-3 text-sm font-semibold text-[#405046]">
            No transactions match these filters
          </p>
          <p className="mt-1 text-xs text-[#8a938c]">
            Clear the date, type, method, or search filters.
          </p>
        </div>
      ) : (
        <div className="max-h-[460px] overflow-auto">
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 border-b border-[#eef0eb] pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#929b93] sm:grid-cols-[100px_minmax(0,1fr)_80px_90px_100px]">
            <span>Date</span>
            <span>Transaction</span>
            <span className="hidden text-right sm:block">Debit</span>
            <span className="hidden text-right sm:block">Credit</span>
            <span className="text-right">Balance</span>
          </div>
          <div className="divide-y divide-[#f0f1ed]">
            {filteredEntries.map((entry) => {
              const balance = balancesById.get(`${entry.kind}-${entry.id}`) ?? 0;
              return (
                <div
                  key={`${entry.kind}-${entry.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 py-3.5 sm:grid-cols-[100px_minmax(0,1fr)_80px_90px_100px]"
                >
                  <span className="text-xs text-[#7f8981]">
                    {formatDate(entry.date)}
                    <span className="mt-0.5 block text-[10px] text-[#a0a79f]">
                      {entryTime(entry)}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                        entry.kind === "sale"
                          ? "bg-[#f7efe4] text-[#a27643]"
                          : entry.kind === "opening"
                            ? "bg-[#f3f0e8] text-[#8b6139]"
                            : "bg-[#edf4eb] text-[#5e8063]"
                      }`}
                    >
                      {entry.kind === "sale" ? (
                        <ArrowUpRight size={13} />
                      ) : entry.kind === "opening" ? (
                        <BookOpen size={13} />
                      ) : (
                        <ArrowDownLeft size={13} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-[#465449]">
                        {entryTypeLabel(entry)}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#929b93]">
                        {entry.description}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[#929b93]">
                        <span className="rounded bg-[#f3f5f1] px-1.5 py-0.5">
                          {entry.payment_method
                            ? paymentMethodLabel(entry.payment_method)
                            : "Ledger"}
                        </span>
                        <span title={entry.id}>
                          ID: {entry.id.slice(0, 8).toUpperCase()}
                        </span>
                        {entry.reference && (
                          <span className="truncate">Ref: {entry.reference}</span>
                        )}
                        {entry.kind === "sale" && ledgerAdvanceNote(entry) && (
                          <span className="font-medium text-sky-700">
                            {ledgerAdvanceNote(entry)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-[#929b93] sm:hidden">
                        {entry.debit
                          ? `Debit ${formatMoney(entry.debit)}`
                          : `Credit ${formatMoney(entry.credit)}`}
                      </span>
                    </span>
                  </span>
                  <span className="hidden text-right text-xs text-[#59685d] sm:block">
                    {entry.debit ? formatMoney(entry.debit) : "—"}
                  </span>
                  <span className="hidden text-right text-xs text-[#59685d] sm:block">
                    {entry.credit ? formatMoney(entry.credit) : "—"}
                  </span>
                  <span
                    className={`text-right text-xs font-semibold ${
                      balance > 0
                        ? "text-red-600"
                        : balance < 0
                          ? "text-sky-700"
                          : "text-[#59685d]"
                    }`}
                  >
                    {formatSignedBalance(balance)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-[#e5e9e2] bg-[#f8faf7] px-2 py-2.5 text-[11px] font-semibold text-[#59685d]">
            <span>{filteredEntries.length} transactions in this view</span>
            <span>
              Debit {formatMoney(totalDebit)} · Credit {formatMoney(totalCredit)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
