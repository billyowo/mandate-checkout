import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileJson2,
  Landmark,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type WorkspaceView = "overview" | "catalog" | "mandates" | "checkout" | "audit";

const rupees = (paise: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(paise / 100);

const compactId = (value?: string | null) => value ? `${value.slice(0, 13)}…${value.slice(-5)}` : "—";

const dateTime = (value?: Date | string | null) => value ? new Date(value).toLocaleString("en-IN", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}) : "—";

function Dot({ tone = "emerald" }: { tone?: "emerald" | "amber" | "violet" | "rose" | "slate" }) {
  return <span className={`status-dot status-dot-${tone}`} aria-hidden="true" />;
}

function StatusPill({ value, tone = "emerald" }: { value: string; tone?: "emerald" | "amber" | "rose" | "violet" | "slate" }) {
  return <span className={`status-pill status-pill-${tone}`}><Dot tone={tone} />{value}</span>;
}

function PolicyStrip({ policy }: { policy?: { result: string; explanation: string; code: string; remainingSpendPaise: number } | null }) {
  if (!policy) return null;
  const allowed = policy.result === "allowed";
  return (
    <div className={`policy-strip ${allowed ? "policy-strip-allowed" : "policy-strip-refused"}`}>
      <div className="policy-strip-icon">{allowed ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="policy-strip-title">{allowed ? "Policy permitted this action" : "Policy refused this action"}</p>
          <span className="mono-label">{policy.code}</span>
        </div>
        <p className="policy-strip-copy">{policy.explanation}</p>
      </div>
      <div className="policy-strip-balance">
        <span>Remaining</span>
        <strong>{rupees(policy.remainingSpendPaise)}</strong>
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<WorkspaceView>("overview");
  const [activeMandateId, setActiveMandateId] = useState<string>("");
  const [selectedSku, setSelectedSku] = useState("OPS-PRO-2400");
  const [quote, setQuote] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [lastPolicy, setLastPolicy] = useState<any>(null);
  const [catalogResponse, setCatalogResponse] = useState<any>(null);
  const [mandateDialogOpen, setMandateDialogOpen] = useState(false);
  const [mandateLabel, setMandateLabel] = useState("Project purchasing mandate");
  const [mandateAmount, setMandateAmount] = useState("2000");
  const [mandateHours, setMandateHours] = useState("168");

  const utils = trpc.useUtils();
  const dashboard = trpc.commerce.dashboard.useQuery(undefined, { refetchInterval: 20_000 });
  const catalogCall = trpc.commerce.getCatalog.useMutation({
    onSuccess: result => {
      setCatalogResponse(result);
      setLastPolicy(result.policy);
      toast.success("Machine-readable catalog returned");
      utils.commerce.dashboard.invalidate();
    },
    onError: () => toast.error("The catalog tool could not complete."),
  });
  const quoteCall = trpc.commerce.quote.useMutation({
    onSuccess: result => {
      setQuote(result);
      setLastPolicy(result.policy);
      toast[result.status === "allowed" ? "success" : "warning"](result.status === "allowed" ? "Quote issued under mandate" : "Quote was safely refused");
      utils.commerce.dashboard.invalidate();
    },
    onError: () => toast.error("The quote tool could not complete."),
  });
  const orderCall = trpc.commerce.createOrder.useMutation({
    onSuccess: result => {
      setOrder(result.order);
      setLastPolicy(result.policy);
      toast[result.status === "created" ? "success" : "warning"](result.status === "created" ? "Order created; spending is reserved" : "Order creation was refused");
      utils.commerce.dashboard.invalidate();
    },
    onError: () => toast.error("The order tool could not complete."),
  });
  const paymentCall = trpc.commerce.confirmPayment.useMutation({
    onSuccess: result => {
      setOrder(result.order);
      setLastPolicy(result.policy);
      toast[result.status === "paid" ? "success" : "warning"](result.status === "paid" ? "Demo payment confirmed" : "Payment confirmation was refused");
      utils.commerce.dashboard.invalidate();
    },
    onError: () => toast.error("The payment confirmation could not complete."),
  });
  const createMandate = trpc.commerce.createMandate.useMutation({
    onSuccess: mandate => {
      setActiveMandateId(mandate.id);
      setMandateDialogOpen(false);
      toast.success("Buyer mandate created");
      utils.commerce.dashboard.invalidate();
    },
    onError: () => toast.error("The mandate could not be created."),
  });

  const catalog = dashboard.data?.catalog ?? [];
  const mandates = dashboard.data?.mandates ?? [];
  const audits = dashboard.data?.audits ?? [];
  const orders = dashboard.data?.orders ?? [];
  const activeMandate = useMemo(() => mandates.find(mandate => mandate.id === activeMandateId) ?? mandates[0], [activeMandateId, mandates]);
  const selectedProduct = catalog.find(product => product?.sku === selectedSku);
  const currentOrder = order ?? orders[0] ?? null;
  const spendPercent = activeMandate ? Math.min(100, Math.round(((activeMandate.spendCapPaise - activeMandate.remainingSpendPaise) / activeMandate.spendCapPaise) * 100)) : 0;

  useEffect(() => {
    if (mandates.length && !activeMandateId) setActiveMandateId(mandates[0].id);
  }, [mandates, activeMandateId]);

  const runQuote = (sku = selectedSku, rationale = "Evaluate this catalog selection against the buyer mandate before a purchase decision.") => {
    if (!activeMandate) return toast.error("Create or choose a mandate first.");
    setSelectedSku(sku);
    setOrder(null);
    quoteCall.mutate({ mandateId: activeMandate.id, sku, rationale });
  };

  const runRecovery = async () => {
    if (!activeMandate) return;
    setSelectedSku("OPS-CORE-1850");
    quoteCall.mutate({
      mandateId: activeMandate.id,
      sku: "OPS-CORE-1850",
      rationale: "Select the lower-cost in-stock alternative recommended after the mandate-cap refusal.",
    });
  };

  const executeMandate = () => {
    const spendCapPaise = Math.round(Number(mandateAmount) * 100);
    const expiresInHours = Number(mandateHours);
    if (!Number.isFinite(spendCapPaise) || spendCapPaise < 5000 || !Number.isFinite(expiresInHours)) {
      toast.error("Enter a valid cap of at least ₹50 and a valid expiry.");
      return;
    }
    createMandate.mutate({ label: mandateLabel, spendCapPaise, expiresInHours });
  };

  if (dashboard.isLoading) {
    return <div className="loading-shell"><Loader2 className="h-5 w-5 animate-spin" />Preparing a governed checkout workspace…</div>;
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="workspace">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark"><Sparkles size={17} strokeWidth={2.3} /></div>
            <div>
              <p className="brand-name">mandate<span>checkout</span></p>
              <p className="brand-caption">Safe agent purchasing</p>
            </div>
          </div>
          <div className="topbar-right">
            <StatusPill value="Policy engine live" tone="emerald" />
            <span className="workspace-divider" />
            <Tooltip><TooltipTrigger asChild><button className="avatar-button" aria-label="Workspace owner">AM</button></TooltipTrigger><TooltipContent>Atlas merchant workspace</TooltipContent></Tooltip>
          </div>
        </header>

        <section className="hero-row">
          <div>
            <div className="eyebrow"><Bot size={14} /> Agent-readable commerce</div>
            <h1>Money moves only when<br /><em>policy says yes.</em></h1>
            <p className="hero-copy">A complete, bounded checkout loop for AI buyers. Every action is proposed by an agent, verified by policy, and preserved as evidence.</p>
          </div>
          <div className="hero-assurance">
            <div className="assurance-icon"><LockKeyhole size={20} /></div>
            <div><span>Payment boundary</span><strong>Server-side only</strong></div>
            <BadgeCheck size={18} className="text-emerald-500" />
          </div>
        </section>

        <nav className="view-nav" aria-label="Commerce dashboard views">
          {[
            ["overview", "Overview", Landmark],
            ["catalog", "Catalog", ShoppingBag],
            ["mandates", "Mandates", WalletCards],
            ["checkout", "Checkout run", Bot],
            ["audit", "Audit trail", ReceiptText],
          ].map(([key, label, Icon]) => (
            <button key={key as string} className={view === key ? "view-nav-item active" : "view-nav-item"} onClick={() => setView(key as WorkspaceView)}>
              <Icon size={16} /><span>{label as string}</span>
            </button>
          ))}
        </nav>

        {view === "overview" && (
          <div className="view-stack">
            <section className="metric-grid">
              <article className="metric-card metric-featured">
                <div className="metric-top"><span>Available to spend</span><StatusPill value="Active" tone="emerald" /></div>
                <strong>{activeMandate ? rupees(activeMandate.remainingSpendPaise) : "—"}</strong>
                <p>of {activeMandate ? rupees(activeMandate.spendCapPaise) : "—"} in the current buyer mandate</p>
                <Progress value={spendPercent} className="spend-progress" />
              </article>
              <article className="metric-card"><div className="metric-icon icon-violet"><PackageCheck size={18} /></div><span>Eligible SKUs</span><strong>{catalog.filter(product => product?.availability.in_stock).length}</strong><p>in-stock products available to this agent</p></article>
              <article className="metric-card"><div className="metric-icon icon-cyan"><ShieldCheck size={18} /></div><span>Governed actions</span><strong>{audits.length}</strong><p>timestamped decisions in the ledger</p></article>
              <article className="metric-card"><div className="metric-icon icon-amber"><CircleDollarSign size={18} /></div><span>Settlement mode</span><strong className="metric-word">{currentOrder?.provider === "razorpay" ? "Test mode" : "Demo safe"}</strong><p>no secret leaves the server boundary</p></article>
            </section>

            <section className="dashboard-grid dashboard-grid-main">
              <article className="panel mandate-panel">
                <div className="panel-head"><div><p className="section-kicker">Buyer authorization</p><h2>Active mandate</h2></div><button className="subtle-button" onClick={() => setView("mandates")}>Manage <ArrowRight size={15} /></button></div>
                {activeMandate ? <>
                  <div className="mandate-title-row"><div className="mandate-token"><WalletCards size={19} /></div><div><p>{activeMandate.label}</p><span className="mono-label">{compactId(activeMandate.id)}</span></div><StatusPill value={activeMandate.status} tone="emerald" /></div>
                  <div className="mandate-details">
                    <div><span>Merchant allowlist</span><strong>Atlas Supply Co.</strong></div>
                    <div><span>Expires</span><strong>{dateTime(activeMandate.expiresAt)}</strong></div>
                    <div><span>Reserved</span><strong>{rupees(activeMandate.reservedPaise)}</strong></div>
                  </div>
                  <div className="allowlist-note"><Check size={15} /> Merchant is explicitly allowed; budget and expiry apply to every checkout action.</div>
                </> : <EmptyState title="No mandate available" copy="Create a mandate to authorize an AI buyer." />}
              </article>

              <article className="panel quick-panel">
                <div className="panel-head"><div><p className="section-kicker">What the agent can do</p><h2>Bounded toolset</h2></div><StatusPill value="4 tools" tone="violet" /></div>
                <div className="tool-list">
                  {(dashboard.data?.supportedTools ?? []).map((tool, index) => <div key={tool} className="tool-line"><span className="tool-index">0{index + 1}</span><code>{tool}</code><Check size={15} /></div>)}
                </div>
                <p className="tool-footnote"><LockKeyhole size={13} /> There is no general charge or unrestricted payment tool.</p>
              </article>
            </section>

            <section className="dashboard-grid">
              <article className="panel checkout-panel">
                <div className="panel-head"><div><p className="section-kicker">Guided demo</p><h2>Run a safe checkout</h2></div><button className="subtle-button" onClick={() => setView("checkout")}>Open workspace <ChevronRight size={15} /></button></div>
                <div className="safe-run-layout">
                  <div className="safe-run-copy"><span className="step-label">Suggested failure recovery</span><p>Start with the ₹2,400 kit. The policy will refuse it against the ₹2,000 demo mandate and offer the eligible ₹1,850 alternative.</p><Button onClick={() => { setView("checkout"); runQuote("OPS-PRO-2400", "Demonstrate mandatory spend-cap refusal and recovery recommendation."); }} disabled={quoteCall.isPending}><AlertTriangle size={16} />Run guarded failure demo</Button></div>
                  <div className="flow-orbit"><span className="flow-node">Agent</span><ArrowRight size={18} /><span className="flow-node flow-node-policy">Policy</span><ArrowRight size={18} /><span className="flow-node">Merchant</span></div>
                </div>
              </article>
              <article className="panel recent-audit-panel">
                <div className="panel-head"><div><p className="section-kicker">Evidence</p><h2>Latest decisions</h2></div><button className="subtle-button" onClick={() => setView("audit")}>View ledger <ArrowRight size={15} /></button></div>
                <div className="mini-audit-list">
                  {audits.slice(0, 3).map(audit => <div key={audit.id} className="mini-audit"><Dot tone={audit.policyResult === "refused" ? "rose" : audit.policyResult === "allowed" ? "emerald" : "slate"} /><div><strong>{audit.action.replaceAll("_", " ")}</strong><span>{audit.outcome.replaceAll("_", " ")}</span></div><time>{dateTime(audit.createdAt)}</time></div>)}
                  {!audits.length && <EmptyState title="No actions yet" copy="Run the catalog or checkout tools to create audit evidence." compact />}
                </div>
              </article>
            </section>
          </div>
        )}

        {view === "catalog" && (
          <section className="view-stack">
            <div className="view-heading"><div><p className="section-kicker">Merchant endpoint</p><h2>Agent-readable catalog</h2><p>Inventory, tax, return eligibility, and SKU price are exposed as structured data — not inferred from a storefront.</p></div><Button variant="outline" className="refresh-button" onClick={() => catalogCall.mutate()} disabled={catalogCall.isPending}>{catalogCall.isPending ? <Loader2 className="animate-spin" size={16} /> : <FileJson2 size={16} />}Run get_catalog</Button></div>
            <div className="catalog-layout">
              <div className="product-grid">{catalog.map(product => product && <article key={product.sku} className={`product-card ${selectedSku === product.sku ? "selected" : ""}`} onClick={() => setSelectedSku(product.sku)}>
                <div className="product-card-top"><div className="product-icon"><PackageCheck size={21} /></div><StatusPill value={product.availability.in_stock ? "In stock" : "Out of stock"} tone={product.availability.in_stock ? "emerald" : "rose"} /></div>
                <p className="product-sku">{product.sku}</p><h3>{product.title}</h3><p className="product-description">{product.description}</p>
                <div className="product-price"><strong>{product.price.display}</strong><span>incl. GST @ {product.tax.gst_percent}%</span></div>
                <div className="product-meta"><span>{product.availability.quantity} available</span><span>7-day returns</span></div>
              </article>)}</div>
              <aside className="schema-card"><div className="schema-card-head"><div><Braces size={17} /><span>catalog.v1</span></div><StatusPill value="JSON" tone="violet" /></div><pre>{JSON.stringify(catalogResponse?.products?.find((product: any) => product.sku === selectedSku) ?? selectedProduct, null, 2)}</pre></aside>
            </div>
            <PolicyStrip policy={catalogResponse?.policy} />
          </section>
        )}

        {view === "mandates" && (
          <section className="view-stack">
            <div className="view-heading"><div><p className="section-kicker">Buyer authorization</p><h2>Mandates with hard boundaries</h2><p>A mandate is a limited buying authorization: merchant allowlist, spend cap, expiry, and tracked remaining balance.</p></div>
              <Dialog open={mandateDialogOpen} onOpenChange={setMandateDialogOpen}><DialogTrigger asChild><Button><Plus size={16} />Create mandate</Button></DialogTrigger><DialogContent className="mandate-dialog"><DialogHeader><DialogTitle>Create a buyer mandate</DialogTitle><DialogDescription>Every money-adjacent tool will validate the policy before continuing.</DialogDescription></DialogHeader><div className="form-stack"><div><Label htmlFor="mandate-name">Label</Label><Input id="mandate-name" value={mandateLabel} onChange={event => setMandateLabel(event.target.value)} /></div><div className="form-columns"><div><Label htmlFor="cap">Spend cap (₹)</Label><Input id="cap" inputMode="numeric" value={mandateAmount} onChange={event => setMandateAmount(event.target.value)} /></div><div><Label htmlFor="hours">Expiry (hours)</Label><Input id="hours" inputMode="numeric" value={mandateHours} onChange={event => setMandateHours(event.target.value)} /></div></div><div className="merchant-locked"><LockKeyhole size={15} /><div><strong>Merchant allowlist</strong><span>Atlas Supply Co. is locked to this demo merchant.</span></div></div><Button onClick={executeMandate} disabled={createMandate.isPending}>{createMandate.isPending && <Loader2 className="animate-spin" size={16} />}Create governed mandate</Button></div></DialogContent></Dialog>
            </div>
            <div className="mandate-grid">{mandates.map(mandate => <article key={mandate.id} className={`mandate-card ${activeMandate?.id === mandate.id ? "is-active" : ""}`}><div className="mandate-card-head"><div className="mandate-token"><WalletCards size={19} /></div><StatusPill value={mandate.status} tone={mandate.status === "active" ? "emerald" : "amber"} /></div><p className="mandate-id">{compactId(mandate.id)}</p><h3>{mandate.label}</h3><div className="cap-amount">{rupees(mandate.remainingSpendPaise)}<span>remaining</span></div><Progress value={Math.min(100, ((mandate.spendCapPaise - mandate.remainingSpendPaise) / mandate.spendCapPaise) * 100)} /><div className="mandate-card-stats"><span><small>Cap</small>{rupees(mandate.spendCapPaise)}</span><span><small>Expiry</small>{dateTime(mandate.expiresAt)}</span></div><div className="allowlist-chip"><Check size={13} />{mandate.merchantAllowlist.join(", ")}</div><Button variant={activeMandate?.id === mandate.id ? "secondary" : "outline"} className="w-full" onClick={() => { setActiveMandateId(mandate.id); toast.success("Active mandate selected"); }}>{activeMandate?.id === mandate.id ? "Selected mandate" : "Use this mandate"}</Button></article>)}</div>
          </section>
        )}

        {view === "checkout" && (
          <section className="view-stack">
            <div className="view-heading"><div><p className="section-kicker">Bounded workflow</p><h2>Checkout run</h2><p>The agent has exactly four available tools. Every transition is verified again at the server boundary.</p></div><StatusPill value="No unrestricted charge action" tone="violet" /></div>
            <div className="checkout-layout">
              <article className="panel agent-run-panel">
                <div className="agent-panel-top"><div className="agent-avatar"><Bot size={21} /></div><div><h3>Atlas purchase agent</h3><p>Runs only permitted tools through policy gates.</p></div><StatusPill value="Ready" tone="emerald" /></div>
                <div className="run-context">
                  <div><span>Mandate</span><Select value={activeMandate?.id ?? ""} onValueChange={setActiveMandateId}><SelectTrigger><SelectValue placeholder="Choose mandate" /></SelectTrigger><SelectContent>{mandates.map(mandate => <SelectItem key={mandate.id} value={mandate.id}>{mandate.label}</SelectItem>)}</SelectContent></Select></div>
                  <div><span>SKU selection</span><Select value={selectedSku} onValueChange={setSelectedSku}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{catalog.filter(Boolean).map(product => <SelectItem key={product!.sku} value={product!.sku}>{product!.sku} · {product!.price.display}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="run-steps">
                  <ToolStep number="01" name="get_catalog" description="Read the structured merchant catalog." status={catalogResponse ? "complete" : "ready"} onClick={() => catalogCall.mutate()} loading={catalogCall.isPending} />
                  <ToolStep number="02" name="quote" description="Check SKU, stock, merchant, cap, and expiry." status={quote ? (quote.status === "allowed" ? "complete" : "refused") : "ready"} onClick={() => runQuote()} loading={quoteCall.isPending} />
                  <ToolStep number="03" name="create_order" description="Reserve funds only for the approved quote." status={order?.status === "created" ? "complete" : "ready"} disabled={!quote || quote.status !== "allowed"} onClick={() => quote && activeMandate && orderCall.mutate({ mandateId: activeMandate.id, quoteId: quote.quoteId, rationale: "Create an order only after the server has validated the current approved quote." })} loading={orderCall.isPending} />
                  <ToolStep number="04" name="confirm_payment" description="Confirm the governed order — never a free-form charge." status={order?.status === "paid" ? "complete" : "ready"} disabled={!order || order.status !== "created"} onClick={() => order && paymentCall.mutate({ orderId: order.id, rationale: "Confirm payment for the current policy-approved order." })} loading={paymentCall.isPending} />
                </div>
                <div className="agent-actions"><Button variant="outline" onClick={() => runQuote("OPS-PRO-2400", "Demonstrate the safe mandate-cap refusal and alternative recommendation.")} disabled={quoteCall.isPending}><AlertTriangle size={16} />Show failure recovery</Button><Button variant="ghost" onClick={() => { setQuote(null); setOrder(null); setLastPolicy(null); }}><RefreshCw size={15} />Reset run</Button></div>
              </article>
              <div className="result-stack">
                <article className="panel decision-panel"><div className="panel-head"><div><p className="section-kicker">Policy decision</p><h2>{lastPolicy ? (lastPolicy.result === "allowed" ? "Approved, with evidence" : "Refused, with recovery") : "Awaiting a tool call"}</h2></div>{lastPolicy && <StatusPill value={lastPolicy.result} tone={lastPolicy.result === "allowed" ? "emerald" : "rose"} />}</div>{lastPolicy ? <><PolicyStrip policy={lastPolicy} /><div className="check-list">{lastPolicy.checks?.map((check: any) => <div key={check.key} className="check-row"><span className={check.result === "pass" ? "check-icon check-pass" : "check-icon check-fail"}>{check.result === "pass" ? <Check size={13} /> : <X size={13} />}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>)}</div></> : <EmptyState title="No policy decision yet" copy="Choose a tool on the left to see explainable checks and a server decision." />}</article>
                {quote?.recovery && <article className="recovery-card"><div className="recovery-icon"><Sparkles size={18} /></div><div><p>Graceful recovery</p><h3>{quote.recovery.product.title} is eligible</h3><span>{quote.recovery.message}</span></div><Button size="sm" onClick={runRecovery}>Quote {quote.recovery.product.sku}</Button></article>}
                <article className="panel payment-state-panel"><div className="panel-head"><div><p className="section-kicker">Payment lifecycle</p><h2>{currentOrder ? currentOrder.status.replaceAll("_", " ") : "No order created"}</h2></div>{currentOrder && <StatusPill value={currentOrder.status} tone={currentOrder.status === "paid" ? "emerald" : "amber"} />}</div>{currentOrder ? <div className="payment-facts"><Fact label="Order reference" value={compactId(currentOrder.id)} mono /><Fact label="Provider order" value={compactId(currentOrder.providerOrderId)} mono /><Fact label="Payment reference" value={compactId(currentOrder.providerPaymentId)} mono /><Fact label="Amount" value={rupees(currentOrder.amountPaise)} /><Fact label="Provider" value={currentOrder.provider === "razorpay" ? "Razorpay test mode" : "Safe demo mode"} /></div> : <EmptyState title="Protected by default" copy="The browser receives only identifiers and status — never payment credentials." compact />}</article>
              </div>
            </div>
          </section>
        )}

        {view === "audit" && (
          <section className="view-stack">
            <div className="view-heading"><div><p className="section-kicker">Immutable evidence</p><h2>Audit trail</h2><p>Every tool call records the decision context, selected SKU, amount, rationale, policy result, and final outcome.</p></div><StatusPill value={`${audits.length} events`} tone="slate" /></div>
            <article className="audit-table-wrap"><div className="audit-table-head"><span>Timestamp</span><span>Tool call / rationale</span><span>Amount</span><span>Policy result</span><span>Outcome</span></div>{audits.map(audit => <div key={audit.id} className="audit-table-row"><time>{dateTime(audit.createdAt)}</time><div><strong>{audit.action}</strong><p>{audit.rationale}</p>{audit.selectedSku && <span className="sku-tiny">{audit.selectedSku}</span>}</div><span>{audit.amountPaise ? rupees(audit.amountPaise) : "—"}</span><StatusPill value={audit.policyResult} tone={audit.policyResult === "allowed" ? "emerald" : audit.policyResult === "refused" ? "rose" : "slate"} /><span className="outcome-text">{audit.outcome.replaceAll("_", " ")}</span></div>)}{!audits.length && <EmptyState title="The ledger is ready" copy="All agent actions will appear here as they are executed." />}</article>
          </section>
        )}

        <footer className="workspace-footer"><span><ShieldCheck size={14} />Policy evaluation happens before every money-adjacent action.</span><span>Designed for agentic commerce · Razorpay test-mode ready</span></footer>
      </section>
    </main>
  );
}

function ToolStep({ number, name, description, status, onClick, disabled, loading }: { number: string; name: string; description: string; status: "ready" | "complete" | "refused"; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  const tone = status === "complete" ? "emerald" : status === "refused" ? "rose" : "slate";
  return <div className={`tool-step tool-step-${status}`}><div className="tool-step-number">{number}</div><div className="tool-step-content"><div><code>{name}</code><p>{description}</p></div><div className="tool-step-action">{status === "complete" ? <StatusPill value="Done" tone="emerald" /> : status === "refused" ? <StatusPill value="Refused" tone="rose" /> : <Button size="sm" variant="outline" onClick={onClick} disabled={disabled || loading}>{loading ? <Loader2 className="animate-spin" size={14} /> : "Run"}</Button>}</div></div></div>;
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="payment-fact"><span>{label}</span><strong className={mono ? "fact-mono" : ""}>{value}</strong></div>;
}

function EmptyState({ title, copy, compact = false }: { title: string; copy: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><ScanSearch size={compact ? 18 : 22} /><div><strong>{title}</strong><p>{copy}</p></div></div>;
}
