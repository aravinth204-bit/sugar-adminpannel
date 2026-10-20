"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  IndianRupee,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Package,
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
  fetchDashboardStats,
  fetchCustomerLedger,
  fetchCustomers,
  getSupabaseClient,
  recordStandalonePayment,
  type Customer,
  type DashboardStats,
  type LedgerEntry,
} from "@/lib/supabase";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatMoney(amount: number) {
  return money.format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

type ModalKind = "customer" | "sale" | "payment" | "ledger" | null;

export default function Home() {
  const [configured, setConfigured] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    todaysSale: 0,
    todaysCashCollected: 0,
  });
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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
    try {
      setCustomers(await fetchCustomers());
      return true;
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "Unable to load customer records.",
      );
      return false;
    } finally {
      setDataLoading(false);
    }
  }, []);

  const refreshDashboardStats = useCallback(async () => {
    try {
      setDashboardStats(await fetchDashboardStats(today()));
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "Unable to load today's sales totals.",
      );
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      void refreshCustomers();
      void refreshDashboardStats();
    }
  }, [authenticated, refreshCustomers, refreshDashboardStats]);

  const visibleCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone ?? "", customer.address ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [customers, query]);

  const totalOutstanding = customers.reduce(
    (total, customer) => total + customer.pending_balance,
    0,
  );

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
    if (kind === "ledger" && customer) {
      setLedgerLoading(true);
      void fetchCustomerLedger(customer.id)
        .then(setLedger)
        .catch((error: unknown) => {
          setFormError(
            error instanceof Error ? error.message : "Unable to load the ledger.",
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
      const createdCustomer = await addCustomer({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        address: String(form.get("address") ?? ""),
      });
      const refreshed = await refreshCustomers();
      setCustomers((current) => {
        if (current.some((customer) => customer.id === createdCustomer.id)) {
          return current;
        }
        return [...current, { ...createdCustomer, pending_balance: 0 }].sort(
          (left, right) => left.name.localeCompare(right.name),
        );
      });
      setModal(null);
      setSuccessMessage(
        refreshed
          ? "Customer added to your ledger."
          : "Customer added, but the customer list could not be refreshed. Use Try again to reload it.",
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add customer.");
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
      const [customersRefreshed] = await Promise.all([
        refreshCustomers(),
        refreshDashboardStats(),
      ]);
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
      const [customersRefreshed] = await Promise.all([
        refreshCustomers(),
        refreshDashboardStats(),
      ]);
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
          <a
            href="#overview"
            onClick={() => setMobileMenu(false)}
            className="flex items-center gap-3 rounded-xl bg-[#eef4ee] px-3 py-2.5 text-sm font-semibold text-[#285d42]"
          >
            <ClipboardList size={18} strokeWidth={1.8} />
            Overview
          </a>
          <a
            href="#customers"
            onClick={() => setMobileMenu(false)}
            className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#717b74] transition hover:bg-[#f7f8f5] hover:text-[#25372c]"
          >
            <Users size={18} strokeWidth={1.8} />
            Customers
          </a>
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
                  Sales &amp; Khata
                </h1>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-[#e7e9e3] bg-white px-3 py-2 text-xs font-medium text-[#68756c] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#67a879]" />
              Ledger up to date
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-7 sm:px-8 sm:pt-9 lg:px-10">
          <section
            id="overview"
            className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"
          >
            <div>
              <p className="text-sm font-medium text-[#758078]">
                {new Intl.DateTimeFormat("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date())}
              </p>
              <h2 className="mt-2 text-[27px] font-semibold tracking-[-0.045em] sm:text-[34px]">
                Good business starts here.
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#7b847e]">
                A clear view of your cane sugar sales and customer balances.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => openModal("payment")}
              >
                <ArrowDownLeft size={16} />
                Record payment
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => openModal("sale")}
              >
                <Plus size={17} />
                Quick sale entry
              </button>
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
                Try again
              </button>
            </div>
          )}

          <section aria-label="Business summary" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryCard
              label="Today’s sale"
              value={formatMoney(dashboardStats.todaysSale)}
              detail="Sales recorded today"
              icon={<Package size={19} />}
              accent="green"
            />
            <SummaryCard
              label="Today’s cash collected"
              value={formatMoney(dashboardStats.todaysCashCollected)}
              detail="Including payments against old dues"
              icon={<Banknote size={19} />}
              accent="cream"
            />
            <SummaryCard
              label="Market pending balance"
              value={formatMoney(totalOutstanding)}
              detail="Outstanding across all customers"
              icon={<IndianRupee size={19} />}
              accent="sage"
              className="sm:col-span-2 xl:col-span-1"
            />
          </section>

          <section id="customers" className="mt-9">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-[-0.025em]">Customers</h3>
                  <span className="rounded-full bg-[#e9eee8] px-2 py-0.5 text-xs font-semibold text-[#607165]">
                    {customers.length}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#838c85]">
                  Keep track of your customer book and pending dues.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <label className="relative min-w-[200px] flex-1 sm:min-w-[240px]">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#959d96]"
                  />
                  <input
                    className="h-10 w-full rounded-xl border border-[#e5e8e1] bg-white pl-10 pr-3 text-sm outline-none placeholder:text-[#a0a79f] focus:border-[#9ab59e]"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search customers"
                  />
                </label>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => openModal("customer")}
                >
                  <Plus size={16} />
                  Add customer
                </button>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-[#e9ebe6] bg-white">
              <div className="hidden grid-cols-[minmax(200px,1.3fr)_minmax(150px,1fr)_minmax(140px,1fr)_120px_105px] gap-4 border-b border-[#eef0eb] bg-[#fbfcfa] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#969e97] md:grid">
                <span>Customer</span>
                <span>Phone number</span>
                <span>Address</span>
                <span className="text-right">Pending balance</span>
                <span />
              </div>
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
                    {query ? "No matching customers" : "Your customer book is empty"}
                  </p>
                  <p className="mt-1 text-sm text-[#8a938c]">
                    {query
                      ? "Try another name, phone number, or address."
                      : "Add your first customer to start recording sales."}
                  </p>
                  {!query && (
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
                <div className="divide-y divide-[#eef0eb]">
                  {visibleCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openModal("ledger", customer)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openModal("ledger", customer);
                        }
                      }}
                      className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition hover:bg-[#fbfcfa] sm:px-5 md:grid-cols-[minmax(200px,1.3fr)_minmax(150px,1fr)_minmax(140px,1fr)_120px_105px] md:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf3ec] text-sm font-semibold text-[#52755a]">
                          {customer.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#29382e]">
                            {customer.name}
                          </p>
                          <p className="mt-0.5 text-xs text-[#9aa19b] md:hidden">
                            {customer.phone || "No phone"}
                          </p>
                        </div>
                      </div>
                      <span className="hidden truncate text-sm text-[#78827a] md:block">
                        {customer.phone || "—"}
                      </span>
                      <span className="hidden truncate text-sm text-[#78827a] md:block">
                        {customer.address || "—"}
                      </span>
                      <span className="text-right">
                        <span
                          className={`block text-sm font-semibold ${
                            customer.pending_balance > 0
                              ? "text-red-600"
                              : "text-[#5b7960]"
                          }`}
                        >
                          {formatMoney(customer.pending_balance)}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[#a0a79f] md:hidden">
                          pending
                        </span>
                      </span>
                      <span className="hidden justify-end md:flex">
                        <button
                          type="button"
                          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#56755e] hover:bg-[#eef4ee]"
                          onClick={(event) => {
                            event.stopPropagation();
                            openModal("ledger", customer);
                          }}
                        >
                          Ledger <ChevronRight size={14} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[#eef0eb] bg-[#fbfcfa] px-5 py-3 text-xs text-[#8d968e]">
                <span>
                  Showing {visibleCustomers.length} of {customers.length} customers
                </span>
                {dataLoading && (
                  <LoaderCircle size={14} className="animate-spin text-[#78927d]" />
                )}
              </div>
            </div>
          </section>

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
        <Modal title={modalTitle(modal)} onClose={closeModal}>
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
                  maxLength={30}
                  placeholder="+91 98765 43210"
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
  accent: "green" | "cream" | "sage";
  className?: string;
}) {
  const accents = {
    green: "bg-[#edf4eb] text-[#52795a]",
    cream: "bg-[#f5f0e7] text-[#9a7c4c]",
    sage: "bg-[#edf1f1] text-[#648080]",
  };

  return (
    <article
      className={`rounded-2xl border border-[#e9ebe6] bg-white p-5 sm:p-5.5 ${className}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-[#747f77]">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accents[accent]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[27px] font-semibold tracking-[-0.045em] text-[#26362c]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[#929a93]">{detail}</p>
    </article>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
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
        className="soft-scrollbar max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-[0_25px_80px_rgba(17,35,23,0.2)] sm:rounded-[24px] sm:p-7"
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
              ? ` · ${formatMoney(customer.pending_balance)} due`
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
  const eligibleCustomers = customers.filter((item) => item.pending_balance > 0);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const customer = customers.find((item) => item.id === customerId);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {eligibleCustomers.length === 0 && (
        <ErrorNotice>
          {customers.length === 0
            ? "Add a customer before recording a payment."
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
            {formatMoney(customer.pending_balance)}
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
            max={customer?.pending_balance}
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
  const whatsappMessage = `Hello ${customer.name}, your pending balance for Karumbu Sakkarai is ${formatMoney(customer.pending_balance)}. Please let us know when convenient. Thank you.`;
  const whatsappHref = whatsappPhone
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
            {formatMoney(customer.pending_balance)}
          </p>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={customer.pending_balance <= 0}
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
