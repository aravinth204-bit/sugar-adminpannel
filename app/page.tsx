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
  Edit,
  Eye,
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
  updateSale,
  type Customer,
  type CustomerSummaryResult,
  type DailyTotals,
  type LedgerEntry,
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
  const [statusFilter, setStatusFilter] = useState<"all" | "due" | "settled" | "no-sales">("all");
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [salesHistoryLoading, setSalesHistoryLoading] = useState(false);
  const [salesHistoryError, setSalesHistoryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "customers" | "sales" | "stock">("overview");
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
      if (statusFilter === "settled") {
        return (
          customer.total_billed !== null &&
          customer.total_billed > 0 &&
          customer.pending_balance === 0
        );
      }
      if (statusFilter === "no-sales") {
        return (
          customer.total_billed === 0 ||
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
      const customersRefreshed = await refreshCustomers();
      if (activeTab === "sales") void refreshSalesHistory();
      if (viewingCustomer) {
        void fetchCustomerLedger(viewingCustomer.id)
          .then(setLedger)
          .catch(() => {});
      }
      if (activeTab === "stock" || stock) void refreshStock();
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
      const customersRefreshed = await refreshCustomers();
      await refreshSalesHistory();
      if (stock) void refreshStock();
      if (viewingCustomer) {
        void fetchCustomerLedger(viewingCustomer.id)
          .then(setLedger)
          .catch(() => {});
      }
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
      const customersRefreshed = await refreshCustomers();
      await refreshSalesHistory();
      if (stock) void refreshStock();
      if (viewingCustomer) {
        void fetchCustomerLedger(viewingCustomer.id)
          .then(setLedger)
          .catch(() => {});
      }
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
      await recordStandalonePayment({
        customerId: String(form.get("customerId") ?? ""),
        amount: Number(form.get("amount")),
        paymentDate: String(form.get("paymentDate") ?? today()),
        notes: String(form.get("notes") ?? ""),
      });
      const customersRefreshed = await refreshCustomers();
      if (viewingCustomer) {
        void fetchCustomerLedger(viewingCustomer.id)
          .then(setLedger)
          .catch(() => {});
      }
      setModal(null);
      setSuccessMessage(
        customersRefreshed
          ? "Payment recorded against the customer's pending dues."
          : "Payment recorded, but the customer list could not be refreshed. Use Try again to reload it.",
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to record payment.");
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
                aria-label="Refresh dashboard"
                title="Refresh customer data"
                className={`${secondaryButton} !w-10 !px-0`}
                disabled={dataLoading}
                onClick={() => void refreshCustomers()}
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
                {activeTab === "sales" && "Sales & Management"}
                {activeTab === "stock" && "Packet Stock & Inventory"}
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#7b847e]">
                {activeTab === "overview" && "Daily sales, collections, pending balances, monthly sales, and stock at a glance."}
                {activeTab === "customers" && "Search customer records, add new customers, and collect pending dues."}
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

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                          c.pending_balance === 0,
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
                    <table className="w-full min-w-[1000px] border-collapse text-left">
                      <thead className="border-b border-[#eef0eb] bg-[#fbfcfa]">
                        <tr className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#969e97]">
                          <th className="px-5 py-3">Customer Name</th>
                          <th className="px-4 py-3">Contact &amp; Area</th>
                          <th className="px-4 py-3 text-right">Total Billed</th>
                          <th className="px-4 py-3 text-right">Total Paid</th>
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
                          const isSettled =
                            customer.total_billed !== null &&
                            customer.total_billed > 0 &&
                            customer.pending_balance === 0;

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
                      const isSettled =
                        customer.total_billed !== null &&
                        customer.total_billed > 0 &&
                        customer.pending_balance === 0;

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
                          <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl bg-[#f8faf7] p-2.5 text-center text-xs">
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
              onReceivePayment={() => openModal("payment", selectedCustomer)}
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
  const phoneDigits = (customer.phone ?? "").replace(/\D/g, "");
  const whatsappPhone =
    phoneDigits.length === 10
      ? `91${phoneDigits}`
      : phoneDigits.startsWith("0") && phoneDigits.length === 11
        ? `91${phoneDigits.slice(1)}`
        : phoneDigits;
  const whatsappMessage = `Hello ${customer.name}, your pending balance for Karumbu Sakkarai is ${formatOptionalMoney(customer.pending_balance)}. Please let us know when convenient. Thank you.`;
  const whatsappHref =
    whatsappPhone && customer.pending_balance !== null
      ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : null;

  const salesEntries = entries.filter((e) => e.kind === "sale");
  const paymentEntries = entries.filter((e) => e.kind === "payment");

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
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#e2e7e0] pt-3 text-center sm:gap-3">
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
        </div>
      </div>

      {/* Action shortcuts */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={
            customer.pending_balance === null || customer.pending_balance <= 0
          }
          onClick={onReceivePayment}
        >
          <Banknote size={16} />
          Receive Due Payment
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
                  <th className="px-3.5 py-2.5 text-right">Balance</th>
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
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#4d5c50]">
                      {entry.debit ? formatMoney(entry.debit) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-[#285d42]">
                      {entry.credit ? formatMoney(entry.credit) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-semibold text-[#48564c]">
                      {formatMoney(entry.balance)}
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
  const isSettled =
    customer.total_billed !== null &&
    customer.total_billed > 0 &&
    customer.pending_balance === 0;
  const whatsappHref = getWhatsAppUrl(customer);
  const salesCount = entries.filter((entry) => entry.kind === "sale").length;
  const paymentCount = entries.filter((entry) => entry.kind === "payment").length;
  const lastPurchase = entries.find((entry) => entry.kind === "sale");
  const lastPayment = entries.find((entry) => entry.kind === "payment");
  const paidPercent =
    customer.total_billed !== null &&
    customer.total_billed > 0 &&
    customer.total_paid !== null
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((customer.total_paid / customer.total_billed) * 100),
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

        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
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
          disabled={
            customer.pending_balance === null || customer.pending_balance <= 0
          }
          onClick={onReceivePayment}
        >
          <Banknote size={16} />
          Receive Due Payment
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
                    <th className="px-5 py-2.5 text-right">Balance</th>
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
                            {entry.kind === "sale" ? "Sale" : "Payment"}
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
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-[#4d5c50]">
                        {entry.debit ? formatMoney(entry.debit) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[#285d42]">
                        {entry.credit ? formatMoney(entry.credit) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-[#48564c]">
                        {formatMoney(running)}
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
                        hasDue ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {formatOptionalMoney(customer.pending_balance)}
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
                          {entry.kind === "sale" ? "Sale" : "Payment"}
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
                      <p className="mt-0.5 text-[10px] text-[#98a19a]">
                        Bal. {formatMoney(running)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
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
  const digits = (customer.phone ?? "").replace(/\D/g, "");
  const phone =
    digits.length === 10
      ? `91${digits}`
      : digits.length === 12 && digits.startsWith("91")
        ? digits
        : null;
  if (!phone || customer.pending_balance === null) return null;
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
            disabled={!hasDue}
            title={hasDue ? "Collect pending dues" : "No pending dues to collect"}
            className={menuItemClass}
            onClick={() => {
              close();
              onReceive();
            }}
          >
            <Banknote size={15} className="text-[#7a8780]" />
            Receive
            {hasDue && (
              <span className="ml-auto text-[11px] font-semibold text-red-600">
                {formatMoney(customer.pending_balance as number)}
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

function paymentMethodLabel(method: SaleRecord["payment_method"]) {
  return method === "upi" ? "UPI" : "Cash";
}

function saleStatusBadge(sale: SaleRecord) {
  if (sale.status === "cancelled") {
    return { label: "Cancelled", className: "bg-slate-100 text-slate-600" };
  }
  const balance = Number(sale.balance);
  const paid = Number(sale.amount_paid);
  if (balance <= 0) {
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
    (sum, sale) => sum + Number(sale.amount_paid),
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
    .reduce((sum, sale) => sum + Number(sale.amount_paid), 0);
  const upiCollected = completed
    .filter((sale) => sale.payment_method === "upi")
    .reduce((sum, sale) => sum + Number(sale.amount_paid), 0);
  const cancelledCount = filtered.filter(
    (sale) => sale.status === "cancelled",
  ).length;

  const summaryItems = [
    {
      label: "Entries shown",
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
      label: "Cash",
      value: formatMoney(cashCollected),
      tone: "text-emerald-700",
    },
    {
      label: "UPI",
      value: formatMoney(upiCollected),
      tone: "text-sky-700",
    },
    {
      label: "Outstanding at sale",
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
            Every sale with discount, payment method, edit, cancel, and receipt
            actions. Newest first.
          </p>
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
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Billed</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance at sale</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0eb]">
                {filtered.map((sale) => {
                  const customer = customerMap.get(sale.customer_id);
                  const status = saleStatusBadge(sale);
                  const total = Number(sale.total_amount);
                  const paid = Number(sale.amount_paid);
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
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            sale.payment_method === "upi"
                              ? "bg-sky-50 text-sky-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {paymentMethodLabel(sale.payment_method)}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold ${
                          isCancelled
                            ? "text-[#9aa39b] line-through"
                            : "text-[#3c4a3f]"
                        }`}
                      >
                        {formatMoney(total)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-medium text-[#285d42]">
                        {formatMoney(paid)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3.5 text-right text-sm font-bold ${
                          isCancelled
                            ? "text-[#9aa39b]"
                            : balance > 0
                              ? "text-red-600"
                              : "text-emerald-700"
                        }`}
                      >
                        {isCancelled ? "—" : formatMoney(balance)}
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
              const paid = Number(sale.amount_paid);
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

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#f8faf7] p-2.5 text-center text-xs">
                    <div>
                      <span className="block text-[10px] text-[#818d83]">
                        Billed
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
                    <div>
                      <span className="block text-[10px] text-[#818d83]">
                        Paid
                      </span>
                      <span className="mt-0.5 block font-semibold text-[#285d42]">
                        {formatMoney(paid)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#818d83]">
                        Balance
                      </span>
                      <span
                        className={`mt-0.5 block font-bold ${
                          isCancelled
                            ? "text-[#9aa39b]"
                            : balance > 0
                              ? "text-red-600"
                              : "text-emerald-700"
                        }`}
                      >
                        {isCancelled ? "—" : formatMoney(balance)}
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
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"} · Newest
          first · Cancelled sales are excluded from balances and stock · Status
          reflects payment at sale time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#6da57a]" />
          Balance = billed − paid
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
  const paid = Number(sale.amount_paid);
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
  const paid = Number(sale.amount_paid);
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
              ? ` · ${formatOptionalMoney(customer.pending_balance)} due`
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
    sale ? String(Number(sale.amount_paid)) : "",
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
  const balance = Math.max(0, total - Number(paid || 0));
  const isNewCustomer = !isEditing && customerId === "__new_customer__";
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId,
  );

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
            max={total.toFixed(2)}
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
          onClick={() => setPaid(total.toFixed(2))}
          className="rounded-md border border-[#dfe6dc] bg-white px-2 py-1 font-semibold text-[#456c4e] hover:bg-[#f3f7f1]"
        >
          Full amount
        </button>
        <button
          type="button"
          onClick={() => setPaid((Math.round(total * 50) / 100).toFixed(2))}
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
        <div className="mt-2 flex items-center justify-between text-[#6c796f]">
          <span>Paid now</span>
          <span className="font-semibold text-[#285d42]">
            {formatMoney(Number(paid || 0))}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-[#e7ede5] pt-2">
          <span className="text-[#6c796f]">
            {Number(paid || 0) <= 0
              ? "Full amount added to balance"
              : balance > 0
                ? "Remaining added to balance"
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
  const eligibleCustomers = customers.filter(
    (item) => item.pending_balance !== null && item.pending_balance > 0,
  );
  const balancesUnavailable = customers.some(
    (item) => item.pending_balance === null,
  );
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const customer = customers.find((item) => item.id === customerId);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {eligibleCustomers.length === 0 && (
        <ErrorNotice>
          {customers.length === 0
            ? "Add a customer before recording a payment."
            : balancesUnavailable
              ? "Customer balances are unavailable. Refresh the dashboard before recording a payment."
              : "There are no customers with pending dues."}
        </ErrorNotice>
      )}
      <Field label="Customer" required>
        <CustomerSelect
          customers={eligibleCustomers}
          selectedId={customerId}
          onChange={setCustomerId}
          includeBalances
        />
      </Field>
      {customer && (
        <div className="flex items-center justify-between rounded-xl bg-[#f6f8f4] px-3.5 py-3 text-sm">
          <span className="text-[#748077]">Current pending balance</span>
          <span className="font-semibold text-[#8b6139]">
            {formatOptionalMoney(customer.pending_balance)}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Payment date" required>
          <input
            className={inputClass}
            type="date"
            name="paymentDate"
            defaultValue={today()}
            required
          />
        </Field>
        <Field label="Amount (₹)" required>
          <input
            className={inputClass}
            type="number"
            name="amount"
            min="0.01"
            max={customer?.pending_balance ?? undefined}
            step="0.01"
            required
            placeholder="0.00"
          />
        </Field>
      </div>
      <Field label="Notes">
        <input
          className={inputClass}
          name="notes"
          maxLength={500}
          placeholder="Optional payment note"
        />
      </Field>
      <FormError message={error} />
      <ModalActions onCancel={onCancel} saving={saving} submitLabel="Save payment" />
    </form>
  );
}

function LedgerView({
  customer,
  entries,
  loading,
  error,
  onReceivePayment,
}: {
  customer: Customer;
  entries: LedgerEntry[];
  loading: boolean;
  error: string;
  onReceivePayment: () => void;
}) {
  const phoneDigits = (customer.phone ?? "").replace(/\D/g, "");
  const whatsappPhone =
    phoneDigits.length === 10
      ? `91${phoneDigits}`
      : phoneDigits.startsWith("0") && phoneDigits.length === 11
        ? `91${phoneDigits.slice(1)}`
        : phoneDigits;
  const whatsappMessage = `Hello ${customer.name}, your pending balance for Karumbu Sakkarai is ${formatOptionalMoney(customer.pending_balance)}. Please let us know when convenient. Thank you.`;
  const whatsappHref = whatsappPhone && customer.pending_balance !== null
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;
  const balancesById = new Map<string, number>();
  const chronological = [...entries].reverse();
  let runningBalance = 0;
  for (const entry of chronological) {
    runningBalance += entry.debit - entry.credit;
    balancesById.set(`${entry.kind}-${entry.id}`, runningBalance);
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between rounded-2xl bg-[#f5f8f3] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#52755a] shadow-sm">
            {customer.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#2d3d32]">{customer.name}</p>
            <p className="mt-0.5 truncate text-xs text-[#849087]">
              {customer.phone || customer.address || "Customer account"}
            </p>
          </div>
        </div>
        <div className="pl-2 text-right">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#849087]">
            Pending
          </p>
          <p className="mt-1 text-sm font-semibold text-red-600">
            {formatOptionalMoney(customer.pending_balance)}
          </p>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={
            customer.pending_balance === null || customer.pending_balance <= 0
          }
          onClick={onReceivePayment}
        >
          <Banknote size={16} />
          Receive due payment
        </button>
        {whatsappHref ? (
          <a
            className={`${secondaryButton} text-[#28734b]`}
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} />
            WhatsApp reminder
          </a>
        ) : (
          <button type="button" className={secondaryButton} disabled title="Add a phone number to this customer to send a WhatsApp reminder.">
            <MessageCircle size={16} />
            WhatsApp unavailable
          </button>
        )}
      </div>

      <FormError message={error} />
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#7c867e]">
          <LoaderCircle size={17} className="animate-spin" />
          Loading ledger…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#dfe5dc] px-4 py-10 text-center">
          <ShoppingBag className="mx-auto text-[#8ca18d]" size={22} />
          <p className="mt-3 text-sm font-semibold text-[#405046]">No transactions yet</p>
          <p className="mt-1 text-xs text-[#8a938c]">
            Sales and payments for this customer will appear here.
          </p>
        </div>
      ) : (
        <div className="max-h-[430px] overflow-auto">
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 border-b border-[#eef0eb] pb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#929b93] sm:grid-cols-[100px_minmax(0,1fr)_80px_90px_100px]">
            <span>Date</span>
            <span>Transaction</span>
            <span className="hidden text-right sm:block">Debit</span>
            <span className="hidden text-right sm:block">Credit</span>
            <span className="text-right">Balance</span>
          </div>
          <div className="divide-y divide-[#f0f1ed]">
            {entries.map((entry) => (
              <div
                key={`${entry.kind}-${entry.id}`}
                className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 py-3.5 sm:grid-cols-[100px_minmax(0,1fr)_80px_90px_100px]"
              >
                <span className="text-xs text-[#7f8981]">{formatDate(entry.date)}</span>
                <span className="flex min-w-0 items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      entry.kind === "sale"
                        ? "bg-[#f7efe4] text-[#a27643]"
                        : "bg-[#edf4eb] text-[#5e8063]"
                    }`}
                  >
                    {entry.kind === "sale" ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownLeft size={13} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-[#465449]">
                      {entry.description}
                    </span>
                    {entry.kind === "sale" && (
                      <span className="mt-0.5 block text-[10px] text-[#929b93]">
                        {entry.sale_unit === "bulk"
                          ? `${entry.sale_quantity} kg × ${formatMoney(entry.rate_per_unit)}/kg`
                          : `${entry.sale_quantity} × ${entry.sale_unit} @ ${formatMoney(entry.rate_per_unit)}`}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[10px] text-[#929b93] sm:hidden">
                      {entry.kind === "sale"
                        ? `Debit ${formatMoney(entry.debit)} · Paid ${formatMoney(entry.credit)}`
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
                <span className="text-right text-xs font-semibold text-[#59685d]">
                  {formatMoney(balancesById.get(`${entry.kind}-${entry.id}`) ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
