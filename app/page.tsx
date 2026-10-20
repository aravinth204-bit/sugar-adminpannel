"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Edit,
  Eye,
  IndianRupee,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Plus,
  Package,
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
  useState,
} from "react";
import {
  addCustomer,
  addDailySale,
  fetchCustomerLedger,
  getBusinessDate,
  getSupabaseClient,
  recordStandalonePayment,
  type Customer,
  type CustomerSummaryResult,
  type DailyTotals,
  type LedgerEntry,
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

type ModalKind = "customer" | "edit-customer" | "customer-details" | "sale" | "payment" | "ledger" | null;

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
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "customers" | "sales">("overview");
  const [mobileMenu, setMobileMenu] = useState(false);

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

  function closeModal() {
    if (saving) return;
    setModal(null);
    setSelectedCustomer(null);
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
        saleDate: String(form.get("saleDate") ?? today()),
        notes: String(form.get("notes") ?? ""),
      });
      const customersRefreshed = await refreshCustomers();
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
              Sign in to manage your cane sugar sales and customer khata.
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
            <ClipboardList size={18} strokeWidth={1.8} />
            Overview
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
            Sales
          </button>
        </div>

        <div className="mt-auto">
          <div className="rounded-2xl bg-[#f5f7f3] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#598365] shadow-sm">
              <CircleHelp size={18} />
            </div>
            <p className="mt-3 text-sm font-semibold text-[#2d3c32]">Need a hand?</p>
            <p className="mt-1 text-xs leading-5 text-[#818b83]">
              Keep your daily sales and khata up to date in one place.
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
                  கரும்பு சர்க்கரை - Khata Admin
                </h1>
                <p className="mt-0.5 hidden text-xs text-[#828b84] sm:block">
                  Daily Packet Sales &amp; Customer Ledger
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={`${secondaryButton} hidden sm:inline-flex`}
                onClick={() => openModal("customer")}
              >
                <Plus size={16} />
                Add Customer
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => openModal("sale")}
              >
                <Plus size={16} />
                <span className="hidden sm:inline">New Sale Entry</span>
                <span className="sm:hidden">New Sale</span>
              </button>
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
          <section
            id="overview"
            className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"
          >
            <div>
              <h2 className="mt-2 text-[27px] font-semibold tracking-[-0.045em] sm:text-[34px]">
                {activeTab === "overview" && "Daily Packet Sales & Customer Ledger"}
                {activeTab === "customers" && "Customer Directory & Balances"}
                {activeTab === "sales" && "Sales Trends & Recent Transactions"}
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#7b847e]">
                {activeTab === "overview" && "Manage customers, track khata balances, and keep your sales records current."}
                {activeTab === "customers" && "Search customer records, add new customers, and collect pending khata dues."}
                {activeTab === "sales" && "Track daily revenue trends, packet volume, and recent sales transactions."}
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
            <section aria-label="Dashboard summary" className="mt-8">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#29382e]">
                      Business overview
                    </h2>
                    <span className="rounded-full bg-[#edf4eb] px-2.5 py-0.5 text-[11px] font-medium text-[#40684b]">
                      Live Metrics
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#838c85]">
                    All-time totals and daily operational figures are kept strictly distinct.
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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryCard
                  label="Total Sales"
                  value={formatMetric(dashboardData?.totalBilled, dataLoading, dataStale)}
                  detail="All-time billed sales value"
                  icon={<Package size={19} />}
                  accent="amber"
                />
                <SummaryCard
                  label="Total Collected"
                  value={formatMetric(dashboardData?.totalPaid, dataLoading, dataStale)}
                  detail="Sale receipts + khata collections"
                  icon={<Banknote size={19} />}
                  accent="emerald"
                />
                <SummaryCard
                  label="Outstanding Due"
                  value={formatMetric(dashboardData?.outstanding, dataLoading, dataStale)}
                  detail="All-time balance pending recovery"
                  icon={<IndianRupee size={19} />}
                  accent="red"
                />
                <SummaryCard
                  label="Total Customers"
                  value={
                    dataLoading
                      ? "Refreshing…"
                      : dataStale || dashboardData?.totalCustomers == null
                      ? "Unavailable"
                      : dashboardData.totalCustomers.toLocaleString("en-IN")
                  }
                  detail="Active customers in khata register"
                  icon={<Users size={19} />}
                  accent="green"
                />
                <SummaryCard
                  label="Today's Sales"
                  value={formatMetric(dailySales, dataLoading, dataStale)}
                  detail={`Sales recorded for ${formatBusinessDate(businessDate)}`}
                  icon={<Package size={19} />}
                  accent="amber"
                />
                <SummaryCard
                  label="Today's Collection"
                  value={formatMetric(dailyCollection, dataLoading, dataStale)}
                  detail={`Collections received on ${formatBusinessDate(businessDate)}`}
                  icon={<Banknote size={19} />}
                  accent="emerald"
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-[#838c85]">
                Date convention: Device local business date. Today&apos;s Sales reflects sales booked on the date; Today&apos;s Collection includes spot payments received at sale time plus standalone payments received on that date.
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
                              className="transition hover:bg-[#fafbf9]"
                            >
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf3ec] text-sm font-semibold text-[#52755a]">
                                    {customer.name.trim().charAt(0).toUpperCase()}
                                  </span>
                                  <div>
                                    <span className="block text-sm font-semibold text-[#29382e]">
                                      {customer.name}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] text-[#8e9891]">
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
                              <td className="px-5 py-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    title="View Details & Khata"
                                    className="flex items-center gap-1 rounded-lg border border-[#e2e7e0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#445248] transition hover:bg-[#f6f8f5]"
                                    onClick={() => openModal("customer-details", customer)}
                                  >
                                    <Eye size={13} />
                                    Details
                                  </button>
                                  <button
                                    type="button"
                                    title="Edit customer details"
                                    className="rounded-lg p-1.5 text-[#6c7870] transition hover:bg-[#edf2eb] hover:text-[#285d42]"
                                    onClick={() => openModal("edit-customer", customer)}
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg bg-[#edf4ed] px-2.5 py-1.5 text-xs font-semibold text-[#285d42] transition hover:bg-[#e2ede2] disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={
                                      customer.pending_balance == null ||
                                      customer.pending_balance <= 0
                                    }
                                    onClick={() => openModal("payment", customer)}
                                  >
                                    Receive
                                  </button>
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#56755e] transition hover:bg-[#eef4ee]"
                                    onClick={() => openModal("ledger", customer)}
                                  >
                                    <BookOpen size={14} /> Ledger
                                  </button>
                                  <WhatsAppReminder customer={customer} />
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
                        <div key={customer.id} className="p-4 sm:p-5">
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
                            <div>
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

                          {/* Mobile Actions Bar */}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#f2f4ef] pt-3">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="flex items-center gap-1 rounded-lg border border-[#e2e7e0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#445248]"
                                onClick={() => openModal("customer-details", customer)}
                              >
                                <Eye size={13} /> Details
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-1.5 text-[#6c7870] hover:bg-[#edf2eb]"
                                onClick={() => openModal("edit-customer", customer)}
                                title="Edit profile"
                              >
                                <Edit size={14} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="rounded-lg bg-[#edf4ed] px-2.5 py-1.5 text-xs font-semibold text-[#285d42] disabled:opacity-40"
                                disabled={
                                  customer.pending_balance == null ||
                                  customer.pending_balance <= 0
                                }
                                onClick={() => openModal("payment", customer)}
                              >
                                Receive
                              </button>
                              <button
                                type="button"
                                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#56755e]"
                                onClick={() => openModal("ledger", customer)}
                              >
                                <BookOpen size={13} /> Ledger
                              </button>
                              <WhatsAppReminder customer={customer} />
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

          {activeTab === "sales" && (
            <div className="mt-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8ece5] bg-white p-5 shadow-[0_2px_8px_rgba(24,40,30,0.03)]">
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#29382e]">
                    Sales Management
                  </h3>
                  <p className="mt-1 text-xs text-[#838c85]">
                    Daily packet sales, 14-day trends, and chronological transaction records.
                  </p>
                </div>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => openModal("sale")}
                >
                  <Plus size={16} />
                  New Sale Entry
                </button>
              </div>

              {dashboardData?.salesAvailable && !dataStale ? (
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
                  <SalesTrend
                    businessDate={businessDate}
                    dailyTotals={dashboardData.dailyTotals}
                    available={dashboardData.salesComplete}
                  />
                  <RecentSales
                    sales={dashboardData.recentSales}
                    customers={customers}
                    complete={dashboardData.salesComplete}
                  />
                </section>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e2e6df] bg-white p-8 text-center text-sm text-[#7b847e]">
                  {dataLoading
                    ? "Loading sales data…"
                    : "No sales recorded yet. Click 'New Sale Entry' to log today's sales."}
                </div>
              )}
            </div>
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

        {/* Khata Financial Summary */}
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

function WhatsAppReminder({ customer }: { customer: Customer }) {
  const digits = (customer.phone ?? "").replace(/\D/g, "");
  const phone =
    digits.length === 10
      ? `91${digits}`
      : digits.length === 12 && digits.startsWith("91")
        ? digits
        : null;
  const message = `Hello ${customer.name}, your pending balance for Karumbu Sakkarai is ${formatOptionalMoney(customer.pending_balance)}. Please let us know when convenient. Thank you.`;

  if (!phone || customer.pending_balance === null) {
    return (
      <button
        type="button"
        className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#a0a79f]"
        disabled
        title={
          customer.pending_balance === null
            ? "The current balance is unavailable."
            : "A valid 10-digit phone number is required for WhatsApp."
        }
      >
        WhatsApp
      </button>
    );
  }

  return (
    <a
      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
      href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      WhatsApp
    </a>
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

function SalesTrend({
  businessDate,
  dailyTotals,
  available,
}: {
  businessDate: string;
  dailyTotals: Record<string, DailyTotals>;
  available: boolean;
}) {
  const lastDate = new Date(`${businessDate}T12:00:00`);
  const dates = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(lastDate);
    date.setDate(lastDate.getDate() - (13 - index));
    return getBusinessDate(date);
  });
  const points = dates.map((date) => ({
    date,
    amount: dailyTotals[date]?.sales ?? 0,
  }));
  const highest = Math.max(...points.map((point) => point.amount), 1);
  const total = points.reduce((sum, point) => sum + point.amount, 0);

  return (
    <section
      aria-labelledby="sales-trend-heading"
      className="rounded-2xl border border-[#e8ece5] bg-white p-5 shadow-[0_2px_8px_rgba(24,40,30,0.03)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2
              id="sales-trend-heading"
              className="text-base font-semibold tracking-[-0.02em] text-[#29382e]"
            >
              Sales overview
            </h2>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              14-Day Trend
            </span>
          </div>
          <p className="mt-1 text-xs text-[#838c85]">Daily billed sales revenue from real database transactions</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <BarChart3 size={18} />
        </span>
      </div>
      {!available ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e2e6df] bg-[#fafbf9] px-4 py-8 text-center text-sm text-[#7b847e]">
          Sales history is incomplete, so a reliable trend cannot be displayed.
        </div>
      ) : total === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e2e6df] bg-[#fafbf9] px-4 py-8 text-center text-sm text-[#7b847e]">
          No sales are recorded in this 14-day window ending {formatDate(businessDate)}.
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-end justify-between gap-1.5 border-b border-l border-[#edf0eb] px-1 pb-2 pt-2 sm:gap-2 sm:px-2">
            {points.map((point) => {
              const label = new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "short",
              }).format(new Date(`${point.date}T12:00:00`));
              const isSelectedDate = point.date === businessDate;
              return (
                <div
                  key={point.date}
                  className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${label}: ${formatMoney(point.amount)}`}
                >
                  <div className="flex h-36 w-full items-end justify-center">
                    <span
                      aria-label={`${label}: ${formatMoney(point.amount)}`}
                      className={`w-[min(65%,24px)] rounded-t-md transition-all duration-200 ${
                        point.amount > 0
                          ? isSelectedDate
                            ? "bg-[#285d42] group-hover:bg-[#1b432e]"
                            : "bg-[#6d9f75] group-hover:bg-[#437852]"
                          : "bg-[#edf1eb]"
                      }`}
                      style={{
                        height: `${Math.max(
                          point.amount > 0 ? 6 : 2,
                          (point.amount / highest) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  {([0, 4, 8, 13].includes(
                    points.findIndex((candidate) => candidate.date === point.date),
                  )) ? (
                    <span
                      className={`mt-2 whitespace-nowrap text-[9px] font-medium ${
                        isSelectedDate ? "font-bold text-[#285d42]" : "text-[#879188]"
                      }`}
                    >
                      {label}
                    </span>
                  ) : (
                    <span className="mt-2 text-[9px] text-transparent" aria-hidden="true">
                      ·
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8faf7] px-3.5 py-2.5 text-xs text-[#6e7a71]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#285d42]" />
              14-day cumulative volume
            </span>
            <span className="font-semibold text-[#2b3e30]">{formatMoney(total)}</span>
          </div>
        </>
      )}
    </section>
  );
}

function RecentSales({
  sales,
  customers,
  complete,
}: {
  sales: CustomerSummaryResult["recentSales"];
  customers: Customer[];
  complete: boolean;
}) {
  const customerNames = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  );

  return (
    <section
      aria-labelledby="recent-sales-heading"
      className="overflow-hidden rounded-2xl border border-[#e8ece5] bg-white shadow-[0_2px_8px_rgba(24,40,30,0.03)]"
    >
      <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <h2
              id="recent-sales-heading"
              className="text-base font-semibold tracking-[-0.02em] text-[#29382e]"
            >
              Recent sales
            </h2>
            <span className="rounded-full bg-[#edf4eb] px-2 py-0.5 text-[10px] font-semibold text-[#456c4e]">
              Latest Entries
            </span>
          </div>
          <p className="mt-1 text-xs text-[#838c85]">
            Chronological sale entries with billed totals and balances
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf4eb] text-[#52795a]">
          <ShoppingBag size={18} />
        </span>
      </div>
      {!complete && (
        <p className="border-y border-amber-100 bg-amber-50 px-5 py-2.5 text-xs leading-5 text-amber-800">
          Showing the newest available entries only. All-time totals are withheld
          because the sales history exceeds the safe read limit.
        </p>
      )}
      {sales.length === 0 ? (
        <div className="border-t border-[#eef0eb] px-5 py-10 text-center text-sm text-[#7b847e]">
          No sales have been recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead className="border-y border-[#eef0eb] bg-[#fbfcfa]">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#969e97]">
                <th className="px-5 py-2.5">Date · Customer</th>
                <th className="px-3 py-2.5 text-right">Billed</th>
                <th className="px-5 py-2.5 text-right">Due / பாக்கி</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef0eb]">
              {sales.map((sale) => (
                <tr key={sale.id} className="transition-colors hover:bg-[#fafbf9]">
                  <td className="px-5 py-3">
                    <span className="block text-xs font-semibold text-[#37463a]">
                      {customerNames.get(sale.customer_id) ?? "Customer"}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[#929b93]">
                      {formatDate(sale.sale_date)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs font-medium text-[#4b5a4f]">
                    {formatMoney(Number(sale.total_amount))}
                  </td>
                  <td
                    className={`px-5 py-3 text-right text-xs font-semibold ${
                      Number(sale.balance) > 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {formatMoney(Number(sale.balance))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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
      return "Customer Details & Khata";
    case "sale":
      return "Record a daily sale";
    case "payment":
      return "Record a payment";
    case "ledger":
      return "Customer ledger";
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
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  customers: Customer[];
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [customerId, setCustomerId] = useState(
    customers.length === 0 ? "__new_customer__" : "",
  );
  const [saleUnit, setSaleUnit] = useState<"500g" | "1kg" | "bulk">("500g");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [paid, setPaid] = useState("");
  const bill = Math.round(Number(quantity || 0) * Number(price || 0) * 100) / 100;
  const balance = Math.max(0, bill - Number(paid || 0));
  const isNewCustomer = customerId === "__new_customer__";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Customer" required>
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
            defaultValue={today()}
            required
          />
        </Field>
        <Field label="Packet weight" required>
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
              <option value="bulk">Bulk (per kg)</option>
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#89938b]"
            />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={saleUnit === "bulk" ? "Quantity (kg)" : "Quantity (packets)"} required>
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
        <Field label={saleUnit === "bulk" ? "Rate per kg (₹)" : "Rate per packet (₹)"} required>
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
        <Field label="Paid now (₹)">
          <input
            className={inputClass}
            type="number"
            name="amountPaid"
            min="0"
            max={bill.toFixed(2)}
            step="0.01"
            value={paid}
            onChange={(event) => setPaid(event.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="rounded-xl border border-[#e8eee6] bg-[#f7faf6] p-4">
        <div className="flex items-center justify-between text-sm text-[#6c796f]">
          <span>Bill total</span>
          <span className="font-semibold text-[#35483a]">{formatMoney(bill)}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-[#e7ede5] pt-2.5 text-sm">
          <span className="text-[#6c796f]">Added to khata</span>
          <span className="font-semibold text-[#9a6133]">{formatMoney(balance)}</span>
        </div>
      </div>
      <Field label="Notes">
        <input
          className={inputClass}
          name="notes"
          maxLength={500}
          placeholder="Optional sale note"
        />
      </Field>
      <FormError message={error} />
      <ModalActions onCancel={onCancel} saving={saving} submitLabel="Save sale" />
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
