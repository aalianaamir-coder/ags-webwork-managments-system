"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
  Wrench,
  RefreshCcw,
  Play,
  Pause,
  XCircle,
  Repeat,
  CreditCard,
  Bug,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  Zap,
  Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  api,
  fmtSAR,
  fmtDate,
  daysUntil,
  SUB_STATUSES,
  TICKET_STATUSES,
  PRIORITIES,
  PAYMENT_METHODS,
  isAdminRole,
} from "@/lib/client-utils";
import { useApp } from "@/lib/store";
import {
  PageHeader,
  EmptyState,
  StatusBadge,
  EntityDialog,
  ConfirmDialog,
  StatCard,
} from "@/components/app/shared";
import {
  InvoiceDocument,
  InvoiceActions,
  type InvoiceDoc,
} from "@/components/app/InvoiceDocument";

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  monthlyPrice?: number | null;
  features: string[];
  updateLimit?: number | null;
  supportLimit?: number | null;
  exclusions?: string | null;
  isActive: boolean;
  activeSubscriptions?: number;
};
type Sub = {
  id: string;
  subscriptionCode: string;
  domain?: string | null;
  websiteUrl?: string | null;
  planType: string;
  monthlyFee: number;
  startDate: string;
  billingDay: number;
  nextBillingDate: string;
  status: string;
  paymentMethod?: string | null;
  lastPaymentDate?: string | null;
  lastMaintenanceDate?: string | null;
  nextMaintenanceDate?: string | null;
  contractTerms?: string | null;
  renewalNotes?: string | null;
  openBalance: number;
  client: {
    id: string;
    businessName: string;
    clientCode: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  plan: Plan & { features: string | null };
  assignedTo?: { id: string; name: string; avatarUrl?: string } | null;
  order?: { id: string; orderCode: string } | null;
  _count?: { invoices: number; tickets: number };
};
type MInv = {
  id: string;
  invoiceCode: string;
  issueDate: string;
  dueDate: string;
  status: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  packagePrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes?: string | null;
  client: {
    id: string;
    businessName: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    location?: string | null;
    city?: string | null;
  };
  subscription: {
    id: string;
    subscriptionCode: string;
    domain?: string | null;
    planType: string;
    plan: { name: string };
  };
  payments: {
    id: string;
    amount: number;
    method: string;
    receivedAt: string;
  }[];
};
type Ticket = {
  id: string;
  ticketCode: string;
  issue: string;
  priority: string;
  status: string;
  expectedCompletion?: string | null;
  workPerformed?: string | null;
  outOfScope: boolean;
  createdAt: string;
  planSnapshot?: string | null;
  supportUsedThisMonth?: number | null;
  supportRemaining?: number | null;
  client: {
    id: string;
    businessName: string;
    phone?: string | null;
    whatsapp?: string | null;
  };
  subscription?: {
    id: string;
    subscriptionCode: string;
    domain?: string | null;
    planType?: string;
    plan: Plan & { features: string | null };
  } | null;
  assignee?: { id: string; name: string; avatarUrl?: string } | null;
};
type ClientOpt = { id: string; businessName: string; clientCode: string };
type TeamMember = { id: string; name: string; role: string };

export default function MaintenanceView() {
  const { user, dataVersion, bumpData } = useApp();
  const isDev = user?.role === "DEVELOPER";
  const isAdmin = isAdminRole(user?.role);
  const isAccountant = user?.role === "ACCOUNTANT";
  const canBilling = isAdmin || isAccountant;

  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api<{ stats: Record<string, number> }>("/api/dashboard")
      .then((r) => setStats(r.stats as Record<string, number>))
      .catch(() => {});
  }, [dataVersion]);

  return (
    <div>
      <PageHeader
        title="Website Maintenance"
        subtitle="Monthly packages, recurring billing, support requests and client subscriptions"
      />

      {stats && !isDev && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
          <StatCard
            label="Active clients"
            value={stats.activeMaintenance ?? 0}
            icon={<Wrench className="w-5 h-5" />}
          />
          <StatCard
            label="Value / Pro / Custom"
            value={`${stats.valuePlan ?? 0} / ${stats.proPlan ?? 0} / ${stats.customPlan ?? 0}`}
            accent="violet"
            delay={0.05}
          />
          <StatCard
            label="MRR (expected)"
            value={fmtSAR(stats.mrr ?? 0, { compact: true })}
            icon={<Repeat className="w-5 h-5" />}
            accent="emerald"
            delay={0.1}
          />
          <StatCard
            label="Outstanding"
            value={fmtSAR(stats.outstandingInvoices ?? 0, { compact: true })}
            accent="amber"
            delay={0.15}
          />
          <StatCard
            label="Overdue subs"
            value={stats.overdueSubs ?? 0}
            accent="rose"
            delay={0.2}
          />
        </div>
      )}

      <Tabs defaultValue={isDev ? "tickets" : "subscriptions"}>
        <TabsList className="flex-wrap h-auto">
          {!isDev && (
            <TabsTrigger value="subscriptions">
              <Repeat className="w-4 h-4 mr-1.5" />
              Subscriptions
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="plans">
              <Wrench className="w-4 h-4 mr-1.5" />
              Packages
            </TabsTrigger>
          )}
          {canBilling && (
            <TabsTrigger value="invoices">
              <CreditCard className="w-4 h-4 mr-1.5" />
              Invoices
            </TabsTrigger>
          )}
          <TabsTrigger value="tickets">
            <Bug className="w-4 h-4 mr-1.5" />
            Support tickets
          </TabsTrigger>
        </TabsList>
        {!isDev && (
          <TabsContent value="subscriptions">
            <SubscriptionsTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="plans">
            <PlansTab />
          </TabsContent>
        )}
        {canBilling && (
          <TabsContent value="invoices">
            <MInvoicesTab />
          </TabsContent>
        )}
        <TabsContent value="tickets">
          <TicketsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ SUBSCRIPTIONS ============ */
function SubscriptionsTab() {
  const { user, dataVersion, bumpData } = useApp();
  const { toast } = useToast();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sub | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Sub | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sub | null>(null);
  const [payDialog, setPayDialog] = useState<Sub | null>(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    method: "Bank Transfer",
    reference: "",
  });

  const isAdmin = isAdminRole(user?.role);

  const [form, setForm] = useState({
    clientId: "",
    orderId: "",
    domain: "",
    websiteUrl: "",
    planId: "",
    monthlyFee: "",
    startDate: new Date().toISOString().slice(0, 10),
    billingDay: "1",
    status: "Pending",
    paymentMethod: "Bank Transfer",
    assignedToId: "",
    contractTerms: "",
    renewalNotes: "",
    nextMaintenanceDate: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, c, t] = await Promise.all([
        api<{ subscriptions: Sub[] }>("/api/maintenance/subscriptions"),
        api<{ plans: Plan[] }>("/api/maintenance/plans"),
        api<{ clients: ClientOpt[] }>("/api/clients"),
        api<{ users: TeamMember[] }>("/api/team"),
      ]);
      setSubs(s.subscriptions);
      setPlans(p.plans);
      setClients(c.clients);
      setTeam(t.users);
    } catch (err) {
      toast({
        title: "Failed to load subscriptions",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return subs.filter((s) => {
      if (statusF !== "all" && s.status !== statusF) return false;
      if (!term) return true;
      return [s.subscriptionCode, s.client.businessName, s.domain].some((v) =>
        v?.toLowerCase().includes(term),
      );
    });
  }, [subs, q, statusF]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...form,
      clientId: "",
      orderId: "",
      domain: "",
      websiteUrl: "",
      planId: "",
      monthlyFee: "",
      status: "Pending",
      contractTerms: "",
      renewalNotes: "",
    });
    setDialogOpen(true);
  };
  const openEdit = (s: Sub) => {
    setEditing(s);
    setForm({
      clientId: s.client.id,
      orderId: s.order?.id ?? "",
      domain: s.domain ?? "",
      websiteUrl: s.websiteUrl ?? "",
      planId: s.plan.id,
      monthlyFee: String(s.monthlyFee),
      startDate: s.startDate.slice(0, 10),
      billingDay: String(s.billingDay),
      status: s.status,
      paymentMethod: s.paymentMethod ?? "Bank Transfer",
      assignedToId: s.assignedTo?.id ?? "",
      contractTerms: s.contractTerms ?? "",
      renewalNotes: s.renewalNotes ?? "",
      nextMaintenanceDate: s.nextMaintenanceDate?.slice(0, 10) ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.clientId || !form.planId || !form.monthlyFee) {
      toast({
        title: "Client, package and monthly fee are required",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      if (editing)
        await api(`/api/maintenance/subscriptions/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      else
        await api("/api/maintenance/subscriptions", {
          method: "POST",
          body: JSON.stringify(form),
        });
      toast({
        title: editing ? "Subscription updated" : "Subscription created",
      });
      setDialogOpen(false);
      bumpData();
    } catch (err) {
      toast({
        title: "Could not save subscription",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const action = async (
    s: Sub,
    act: string,
    extra: Record<string, unknown> = {},
  ) => {
    try {
      await api(`/api/maintenance/subscriptions/${s.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action: act, ...extra }),
      });
      toast({ title: `Subscription ${act}d` });
      bumpData();
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/api/maintenance/subscriptions/${deleteTarget.id}`, {
        method: "DELETE",
      });
      toast({ title: "Subscription deleted" });
      setDeleteTarget(null);
      bumpData();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async () => {
    // Find the latest unpaid invoice for this subscription and record against it
    if (!payDialog || !payForm.amount) return;
    setBusy(true);
    try {
      const invs = await api<{ invoices: MInv[] }>(
        `/api/maintenance/invoices?q=${payDialog.subscriptionCode}`,
      );
      const open = invs.invoices.find(
        (i) =>
          i.subscription.id === payDialog.id &&
          ["Issued", "Partially Paid", "Overdue"].includes(i.status),
      );
      if (!open)
        throw new Error(
          "No open invoice found for this subscription. Generate the invoice first.",
        );
      await api(`/api/maintenance/invoices/${open.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: payForm.amount,
          method: payForm.method,
          reference: payForm.reference,
        }),
      });
      toast({ title: "Maintenance payment recorded" });
      setPayDialog(null);
      setPayForm({ amount: "", method: "Bank Transfer", reference: "" });
      bumpData();
    } catch (err) {
      toast({
        title: "Could not record payment",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subscriptions…"
            className="pl-9"
          />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SUB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Button
            size="sm"
            onClick={openCreate}
            className="brand-gradient-bg text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New subscription
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No maintenance subscriptions"
          hint="Create a subscription when a client takes a monthly maintenance package."
          icon={<Repeat className="w-7 h-7" />}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Package
                  </TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Next billing
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Balance
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const days = daysUntil(s.nextBillingDate);
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer group"
                      onClick={() => setDetail(s)}
                    >
                      <TableCell>
                        <p className="text-xs font-bold">
                          {s.subscriptionCode}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-36">
                          {s.domain ?? "no domain"}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.client.businessName}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-primary/10 text-primary">
                          {s.planType}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {fmtSAR(s.monthlyFee, { compact: true })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">
                        <span
                          className={
                            days !== null && days <= 3
                              ? "text-amber-500 font-semibold"
                              : ""
                          }
                        >
                          {fmtDate(s.nextBillingDate)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-amber-600 dark:text-amber-400">
                        {s.openBalance > 0
                          ? fmtSAR(s.openBalance, { compact: true })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isAdmin && (
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => openEdit(s)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {s.status === "Paused" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-500"
                                title="Resume"
                                onClick={() => action(s, "resume")}
                              >
                                <Play className="w-3.5 h-3.5" />
                              </Button>
                            ) : ["Active", "Payment Due", "Overdue"].includes(
                                s.status,
                              ) ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-500"
                                title="Pause"
                                onClick={() =>
                                  action(s, "pause", {
                                    reason: "Paused by CEO",
                                  })
                                }
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </Button>
                            ) : null}
                            {s.status !== "Cancelled" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-500"
                                title="Cancel"
                                onClick={() => action(s, "cancel")}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-500"
                              title="Delete"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Create / edit subscription */}
      <EntityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          editing
            ? `Edit ${editing.subscriptionCode}`
            : "New maintenance subscription"
        }
        wide
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Client *</Label>
            <Select
              value={form.clientId}
              onValueChange={(v) => setForm({ ...form, clientId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.businessName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Package *</Label>
            <Select
              value={form.planId}
              onValueChange={(v) => {
                const p = plans.find((x) => x.id === v);
                setForm({
                  ...form,
                  planId: v,
                  monthlyFee:
                    p?.monthlyPrice != null
                      ? String(p.monthlyPrice)
                      : form.monthlyFee,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select package" />
              </SelectTrigger>
              <SelectContent>
                {plans
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.monthlyPrice != null
                        ? ` — SAR ${p.monthlyPrice}/mo`
                        : " — custom price"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Monthly fee (SAR) *</Label>
            <Input
              type="number"
              value={form.monthlyFee}
              onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
              placeholder="Set the agreed monthly price"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Domain</Label>
            <Input
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="clientwebsite.com"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Live URL</Label>
            <Input
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start date</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm({
                  ...form,
                  startDate: e.target.value,
                  billingDay: String(new Date(e.target.value).getDate() || 1),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Billing day of month</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={form.billingDay}
              onChange={(e) => setForm({ ...form, billingDay: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUB_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment method</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => setForm({ ...form, paymentMethod: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assigned team member</Label>
            <Select
              value={form.assignedToId || "none"}
              onValueChange={(v) =>
                setForm({ ...form, assignedToId: v === "none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} — {m.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Contract terms / renewal notes</Label>
            <Textarea
              rows={2}
              value={form.contractTerms}
              onChange={(e) =>
                setForm({ ...form, contractTerms: e.target.value })
              }
              placeholder="Included limits, exclusions agreed with the client, renewal date…"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy}
            className="brand-gradient-bg text-white"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            {editing ? "Save changes" : "Create subscription"}
          </Button>
        </div>
      </EntityDialog>

      {/* Detail */}
      <EntityDialog
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        title={
          detail
            ? `${detail.subscriptionCode} — ${detail.client.businessName}`
            : ""
        }
        wide
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.status} />
              <span className="text-xs text-muted-foreground">
                {detail.plan.name} · {fmtSAR(detail.monthlyFee)}/month · billing
                day {detail.billingDay}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <p>
                <span className="text-muted-foreground">Domain:</span>{" "}
                {detail.domain ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Start:</span>{" "}
                {fmtDate(detail.startDate)}
              </p>
              <p>
                <span className="text-muted-foreground">Next billing:</span>{" "}
                {fmtDate(detail.nextBillingDate)}
              </p>
              <p>
                <span className="text-muted-foreground">Last payment:</span>{" "}
                {fmtDate(detail.lastPaymentDate)}
              </p>
              <p>
                <span className="text-muted-foreground">Last maintenance:</span>{" "}
                {fmtDate(detail.lastMaintenanceDate)}
              </p>
              <p>
                <span className="text-muted-foreground">Next maintenance:</span>{" "}
                {fmtDate(detail.nextMaintenanceDate)}
              </p>
              <p>
                <span className="text-muted-foreground">Assigned to:</span>{" "}
                {detail.assignedTo?.name ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Open balance:</span>{" "}
                <b className="text-amber-500">{fmtSAR(detail.openBalance)}</b>
              </p>
            </div>
            {detail.contractTerms && (
              <div className="rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap">
                {detail.contractTerms}
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Package includes
              </p>
              <ul className="text-xs space-y-1">
                {(() => {
                  try {
                    return (
                      JSON.parse(detail.plan.features ?? "[]") as string[]
                    ).map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ));
                  } catch {
                    return null;
                  }
                })()}
              </ul>
              {detail.plan.supportLimit != null && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Support limit: {detail.plan.supportLimit} request(s) per month
                  · updates: {detail.plan.updateLimit ?? "unlimited"}
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => action(detail, "renew", { months: 1 })}
                >
                  <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                  Renew +1 month
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    action(detail, "record-maintenance", {
                      note: "Maintenance performed",
                    })
                  }
                >
                  <Wrench className="w-3.5 h-3.5 mr-1.5" />
                  Record maintenance
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPayDialog(detail)}
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                  Record payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetail(null);
                    openEdit(detail);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              </div>
            )}
          </div>
        )}
      </EntityDialog>

      {/* Record payment */}
      <EntityDialog
        open={!!payDialog}
        onOpenChange={(v) => !v && setPayDialog(null)}
        title={`Record maintenance payment — ${payDialog?.client.businessName ?? ""}`}
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Records a payment against the latest open invoice of{" "}
            {payDialog?.subscriptionCode}. If none exists, generate it from the
            Invoices tab first.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount (SAR)</Label>
              <Input
                type="number"
                value={payForm.amount}
                onChange={(e) =>
                  setPayForm({ ...payForm, amount: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Select
                value={payForm.method}
                onValueChange={(v) => setPayForm({ ...payForm, method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Reference</Label>
              <Input
                value={payForm.reference}
                onChange={(e) =>
                  setPayForm({ ...payForm, reference: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPayDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={recordPayment}
              disabled={busy}
              className="brand-gradient-bg text-white"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Record payment
            </Button>
          </div>
        </div>
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.subscriptionCode}?`}
        description="Only possible when the subscription has no billing history — otherwise cancel it instead."
        onConfirm={doDelete}
        confirmLabel="Delete"
        busy={busy}
      />
    </div>
  );
}

/* ============ PACKAGES ============ */
function PlansTab() {
  const { dataVersion, bumpData } = useApp();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    monthlyPrice: "",
    features: [] as string[],
    updateLimit: "",
    supportLimit: "",
    exclusions: "",
    sortOrder: "10",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ plans: Plan[] }>("/api/maintenance/plans");
      setPlans(res.plans);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      code: p.code,
      name: p.name,
      description: p.description ?? "",
      monthlyPrice: p.monthlyPrice != null ? String(p.monthlyPrice) : "",
      features: p.features ?? [],
      updateLimit: p.updateLimit != null ? String(p.updateLimit) : "",
      supportLimit: p.supportLimit != null ? String(p.supportLimit) : "",
      exclusions: p.exclusions ?? "",
      sortOrder: "10",
    });
    setDialogOpen(true);
  };
  const openCreate = () => {
    setEditing(null);
    setForm({
      code: "",
      name: "",
      description: "",
      monthlyPrice: "",
      features: [],
      updateLimit: "",
      supportLimit: "",
      exclusions: "",
      sortOrder: "10",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code || !form.name) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (editing)
        await api(`/api/maintenance/plans/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      else
        await api("/api/maintenance/plans", {
          method: "POST",
          body: JSON.stringify(form),
        });
      toast({ title: editing ? "Package updated" : "Package created" });
      setDialogOpen(false);
      bumpData();
    } catch (err) {
      toast({
        title: "Could not save package",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={openCreate}
          className="brand-gradient-bg text-white"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add package
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`rounded-2xl border p-5 relative overflow-hidden ${p.isActive ? "" : "opacity-60"}`}
          >
            {p.code === "PRO" && (
              <div className="absolute top-4 right-4 text-[9px] font-black tracking-widest brand-gradient-bg text-white px-2.5 py-1 rounded-full">
                POPULAR
              </div>
            )}
            <p className="text-[10px] font-black tracking-widest text-primary uppercase">
              {p.code}
            </p>
            <h3 className="font-bold text-lg mt-1">{p.name}</h3>
            <p className="text-2xl font-black mt-2">
              {p.monthlyPrice != null ? (
                <>
                  SAR {p.monthlyPrice}
                  <span className="text-xs font-medium text-muted-foreground">
                    /month
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground font-semibold">
                  Custom pricing per client
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {p.description}
            </p>
            <ul className="mt-3 space-y-1.5">
              {p.features.map((f, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 mt-3 text-[10px] text-muted-foreground">
              {p.supportLimit != null && (
                <span className="rounded-full bg-muted px-2 py-1">
                  {p.supportLimit} support requests/mo
                </span>
              )}
              {p.updateLimit != null && (
                <span className="rounded-full bg-muted px-2 py-1">
                  {p.updateLimit} updates/mo
                </span>
              )}
              <span className="rounded-full bg-muted px-2 py-1">
                {p.activeSubscriptions ?? 0} active subs
              </span>
            </div>
            {p.exclusions && (
              <p className="text-[10px] text-muted-foreground mt-2 border-t pt-2">
                Excluded: {p.exclusions}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>

      <EntityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `Edit ${editing.name}` : "Add maintenance package"}
        wide
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Code * (VALUE / PRO / CUSTOM…)</Label>
            <Input
              value={form.code}
              onChange={(e) =>
                setForm({ ...form, code: e.target.value.toUpperCase() })
              }
              disabled={!!editing}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Monthly price (SAR) — leave blank for custom per-client pricing
            </Label>
            <Input
              type="number"
              value={form.monthlyPrice}
              onChange={(e) =>
                setForm({ ...form, monthlyPrice: e.target.value })
              }
              placeholder="Configured by CEO"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Included support requests / month (blank = unlimited)
            </Label>
            <Input
              type="number"
              value={form.supportLimit}
              onChange={(e) =>
                setForm({ ...form, supportLimit: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Included updates / month (blank = unlimited)
            </Label>
            <Input
              type="number"
              value={form.updateLimit}
              onChange={(e) =>
                setForm({ ...form, updateLimit: e.target.value })
              }
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Description</Label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Features (one per line)</Label>
            <Textarea
              rows={6}
              value={form.features.join("\n")}
              onChange={(e) =>
                setForm({
                  ...form,
                  features: e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              placeholder={"Basic website maintenance\nMinor text updates\n..."}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Exclusions</Label>
            <Textarea
              rows={2}
              value={form.exclusions}
              onChange={(e) => setForm({ ...form, exclusions: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy}
            className="brand-gradient-bg text-white"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            {editing ? "Save package" : "Create package"}
          </Button>
        </div>
      </EntityDialog>
    </div>
  );
}

/* ============ INVOICES ============ */
function MInvoicesTab() {
  const { user, dataVersion, bumpData } = useApp();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<MInv[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<MInv | null>(null);
  const [genSub, setGenSub] = useState("");
  const [payInv, setPayInv] = useState<MInv | null>(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    method: "Bank Transfer",
    reference: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, sub, st] = await Promise.all([
        api<{ invoices: MInv[] }>("/api/maintenance/invoices"),
        api<{ subscriptions: Sub[] }>("/api/maintenance/subscriptions"),
        api<{ settings: Record<string, unknown> }>("/api/settings"),
      ]);
      setInvoices(inv.invoices);
      setSubs(sub.subscriptions);
      setSettings(st.settings);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusF !== "all" && i.status !== statusF) return false;
      if (!term) return true;
      return [
        i.invoiceCode,
        i.client.businessName,
        i.subscription.subscriptionCode,
      ].some((v) => v?.toLowerCase().includes(term));
    });
  }, [invoices, q, statusF]);

  const generateFor = async (subscriptionId: string) => {
    if (!subscriptionId) {
      toast({ title: "Select a subscription first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ invoice: MInv }>("/api/maintenance/invoices", {
        method: "POST",
        body: JSON.stringify({ subscriptionId }),
      });
      toast({ title: `Invoice ${res.invoice.invoiceCode} generated` });
      setGenSub("");
      bumpData();
    } catch (err) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const runScheduler = async () => {
    setBusy(true);
    try {
      const res = await api<{
        created: number;
        overdueMarked: number;
        processed: number;
        skipped: number;
      }>("/api/maintenance/scheduler/run", { method: "POST" });
      toast({
        title: "Recurring scheduler executed",
        description: `${res.created} new invoice(s) · ${res.skipped} already invoiced · ${res.overdueMarked} marked overdue.`,
      });
      bumpData();
    } catch (err) {
      toast({
        title: "Scheduler failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const markStatus = async (inv: MInv, status: string) => {
    try {
      await api(`/api/maintenance/invoices/${inv.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast({ title: `${inv.invoiceCode} → ${status}` });
      bumpData();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const recordPayment = async () => {
    if (!payInv || !payForm.amount) return;
    setBusy(true);
    try {
      await api(`/api/maintenance/invoices/${payInv.id}/payments`, {
        method: "POST",
        body: JSON.stringify(payForm),
      });
      toast({ title: "Payment recorded" });
      setPayInv(null);
      setPayForm({ amount: "", method: "Bank Transfer", reference: "" });
      bumpData();
    } catch (err) {
      toast({
        title: "Could not record payment",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const docFor = (inv: MInv): InvoiceDoc => ({
    kind: "maintenance",
    invoiceCode: inv.invoiceCode,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    clientName: inv.client.businessName,
    clientContact: inv.client.contactPerson,
    clientPhone: inv.client.phone,
    clientEmail: inv.client.email,
    clientLocation: [inv.client.location, inv.client.city]
      .filter(Boolean)
      .join(", "),
    items: [
      {
        description: `${inv.subscription.plan.name} — monthly website maintenance${inv.subscription.domain ? ` (${inv.subscription.domain})` : ""}`,
        quantity: 1,
        unitPrice: inv.packagePrice,
        amount: inv.packagePrice,
      },
    ],
    subtotal: inv.packagePrice,
    taxRate: inv.taxRate,
    taxAmount: inv.taxAmount,
    total: inv.total,
    amountPaid: inv.amountPaid,
    notes: inv.notes,
    domain: inv.subscription.domain ?? undefined,
    packageName: inv.subscription.plan.name,
    billingPeriod: `${fmtDate(inv.billingPeriodStart)} — ${fmtDate(inv.billingPeriodEnd)}`,
    preparedBy: user
      ? {
          name: user.name,
          role: user.jobTitle,
          avatarUrl: user.avatarUrl ?? null,
        }
      : null,
    settings: settings as InvoiceDoc["settings"],
  });

  return (
    <div className="space-y-4">
      {/* Generate controls */}
      <div className="rounded-xl border bg-card p-4 flex flex-col lg:flex-row gap-3 lg:items-end">
        <div className="space-y-1 flex-1">
          <Label className="text-xs">Generate invoice for subscription</Label>
          <Select value={genSub} onValueChange={setGenSub}>
            <SelectTrigger>
              <SelectValue placeholder="Select subscription (active / due)" />
            </SelectTrigger>
            <SelectContent>
              {subs
                .filter((s) =>
                  ["Active", "Payment Due", "Overdue", "Pending"].includes(
                    s.status,
                  ),
                )
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.subscriptionCode} — {s.client.businessName} (
                    {fmtSAR(s.monthlyFee)}/mo, next billing{" "}
                    {fmtDate(s.nextBillingDate)})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => generateFor(genSub)}
          disabled={busy || !genSub}
          className="brand-gradient-bg text-white"
        >
          <Zap className="w-4 h-4 mr-1.5" />
          Generate invoice
        </Button>
        <Button variant="outline" onClick={runScheduler} disabled={busy}>
          <RefreshCcw className="w-4 h-4 mr-1.5" />
          Run recurring scheduler
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search maintenance invoices…"
            className="pl-9"
          />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {[
              "Draft",
              "Issued",
              "Partially Paid",
              "Paid",
              "Overdue",
              "Void",
            ].map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No maintenance invoices"
          hint="Generate the first monthly invoice for an active subscription above, or let the automatic scheduler create them."
          icon={<CreditCard className="w-7 h-7" />}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Period</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="hidden lg:table-cell">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <p className="text-xs font-bold">{inv.invoiceCode}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {inv.subscription.planType}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {inv.client.businessName}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[10px] text-muted-foreground">
                      {fmtDate(inv.billingPeriodStart)} →{" "}
                      {fmtDate(inv.billingPeriodEnd)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      {fmtDate(inv.dueDate)}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      {fmtSAR(inv.total)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-emerald-500">
                      {fmtSAR(inv.amountPaid)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setViewing(inv)}
                          aria-label="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {["Issued", "Partially Paid", "Overdue"].includes(
                          inv.status,
                        ) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-500"
                            title="Record payment"
                            onClick={() => {
                              setPayInv(inv);
                              setPayForm({
                                ...payForm,
                                amount: String(inv.total - inv.amountPaid),
                              });
                            }}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Invoice document */}
      <EntityDialog
        open={!!viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        title={`Maintenance invoice ${viewing?.invoiceCode ?? ""}`}
      >
        {viewing && (
          <div className="space-y-3">
            <InvoiceActions doc={docFor(viewing)} />
            <div className="overflow-x-auto -mx-2 px-2">
              <InvoiceDocument doc={docFor(viewing)} />
            </div>
            <div className="flex flex-wrap gap-2 no-print pt-2">
              {["Issued", "Overdue", "Void"].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  onClick={() => markStatus(viewing, s)}
                >
                  Mark {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </EntityDialog>

      {/* Record payment */}
      <EntityDialog
        open={!!payInv}
        onOpenChange={(v) => !v && setPayInv(null)}
        title={`Record payment — ${payInv?.invoiceCode ?? ""}`}
      >
        {payInv && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Total {fmtSAR(payInv.total)} · paid {fmtSAR(payInv.amountPaid)} ·
              balance{" "}
              <b className="text-amber-500">
                {fmtSAR(payInv.total - payInv.amountPaid)}
              </b>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount (SAR)</Label>
                <Input
                  type="number"
                  value={payForm.amount}
                  onChange={(e) =>
                    setPayForm({ ...payForm, amount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select
                  value={payForm.method}
                  onValueChange={(v) => setPayForm({ ...payForm, method: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Reference</Label>
                <Input
                  value={payForm.reference}
                  onChange={(e) =>
                    setPayForm({ ...payForm, reference: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayInv(null)}>
                Cancel
              </Button>
              <Button
                onClick={recordPayment}
                disabled={busy}
                className="brand-gradient-bg text-white"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                Record payment
              </Button>
            </div>
          </div>
        )}
      </EntityDialog>
    </div>
  );
}

/* ============ TICKETS ============ */
function TicketsTab() {
  const { user, dataVersion, bumpData } = useApp();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [mine, setMine] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);

  const isDev = user?.role === "DEVELOPER";

  const [form, setForm] = useState({
    subscriptionId: "",
    issue: "",
    priority: "Medium",
    assigneeId: "",
    expectedCompletion: "",
    outOfScope: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s, tm] = await Promise.all([
        api<{ tickets: Ticket[] }>(
          `/api/maintenance/tickets${mine || isDev ? "?mine=true" : ""}`,
        ),
        api<{ subscriptions: Sub[] }>("/api/maintenance/subscriptions"),
        api<{ users: TeamMember[] }>("/api/team"),
      ]);
      setTickets(t.tickets);
      setSubs(s.subscriptions);
      setTeam(tm.users);
    } catch (err) {
      toast({
        title: "Failed to load tickets",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [mine, isDev, toast]);
  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusF !== "all" && t.status !== statusF) return false;
      if (!term) return true;
      return [t.ticketCode, t.issue, t.client.businessName].some((v) =>
        v?.toLowerCase().includes(term),
      );
    });
  }, [tickets, q, statusF]);

  const save = async () => {
    if (!form.issue) {
      toast({ title: "Describe the issue", variant: "destructive" });
      return;
    }
    const sub = subs.find((s) => s.id === form.subscriptionId);
    setBusy(true);
    try {
      await api("/api/maintenance/tickets", {
        method: "POST",
        body: JSON.stringify({ ...form, clientId: sub?.client.id }),
      });
      toast({ title: "Ticket created" });
      setDialogOpen(false);
      setForm({
        subscriptionId: "",
        issue: "",
        priority: "Medium",
        assigneeId: "",
        expectedCompletion: "",
        outOfScope: false,
      });
      bumpData();
    } catch (err) {
      toast({
        title: "Could not create ticket",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const update = async (t: Ticket, patch: Record<string, unknown>) => {
    try {
      await api(`/api/maintenance/tickets/${t.id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      toast({ title: `${t.ticketCode} updated` });
      bumpData();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/api/maintenance/tickets/${deleteTarget.id}`, {
        method: "DELETE",
      });
      toast({ title: "Ticket deleted" });
      setDeleteTarget(null);
      bumpData();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tickets…"
            className="pl-9"
          />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isDev && (
          <>
            <Button
              variant={mine ? "default" : "outline"}
              size="sm"
              onClick={() => setMine(!mine)}
              className={mine ? "brand-gradient-bg text-white" : ""}
            >
              My tickets
            </Button>
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="brand-gradient-bg text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New ticket
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No support tickets"
          hint={
            isDev
              ? "Maintenance requests assigned to you appear here."
              : "Log client maintenance requests and track the work performed."
          }
          icon={<Bug className="w-7 h-7" />}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Client / website</TableHead>
                  <TableHead className="hidden md:table-cell">Plan</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Assignee
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer group"
                    onClick={() => setEditing(t)}
                  >
                    <TableCell>
                      <p className="text-xs font-bold">{t.ticketCode}</p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-56">
                        {t.issue}
                      </p>
                      {t.outOfScope && (
                        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                          OUT OF SCOPE — quote needed
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs">{t.client.businessName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.subscription?.domain ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-[10px]">
                        {t.planSnapshot ?? t.subscription?.planType ?? "—"}
                      </p>
                      {t.supportRemaining !== null &&
                        t.supportRemaining !== undefined && (
                          <p
                            className={`text-[9px] ${t.supportRemaining <= 0 ? "text-rose-500 font-bold" : "text-muted-foreground"}`}
                          >
                            {t.supportRemaining} left this month
                          </p>
                        )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.priority} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      {t.assignee?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        {user?.role !== "ADMIN" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditing(t)}
                            aria-label="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {isAdminRole(user?.role) && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditing(t)}
                              aria-label="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-500"
                              onClick={() => setDeleteTarget(t)}
                              aria-label="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Create */}
      <EntityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New maintenance ticket"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Client subscription</Label>
            <Select
              value={form.subscriptionId}
              onValueChange={(v) => setForm({ ...form, subscriptionId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select subscription" />
              </SelectTrigger>
              <SelectContent>
                {subs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.subscriptionCode} — {s.client.businessName} ({s.planType}
                    )
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Issue description *</Label>
            <Textarea
              rows={3}
              value={form.issue}
              onChange={(e) => setForm({ ...form, issue: e.target.value })}
              placeholder="e.g. Homepage slider not loading on mobile"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assign to</Label>
              <Select
                value={form.assigneeId || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, assigneeId: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} — {m.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expected completion</Label>
              <Input
                type="date"
                value={form.expectedCompletion}
                onChange={(e) =>
                  setForm({ ...form, expectedCompletion: e.target.value })
                }
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.outOfScope}
                  onChange={(e) =>
                    setForm({ ...form, outOfScope: e.target.checked })
                  }
                  className="accent-primary"
                />
                Out of scope (needs separate quotation)
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy}
            className="brand-gradient-bg text-white"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Create
            ticket
          </Button>
        </div>
      </EntityDialog>

      {/* Edit / work */}
      <EntityDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={
          editing
            ? `${editing.ticketCode} — ${editing.client.businessName}`
            : ""
        }
        wide
      >
        {editing && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={editing.status} />
              <StatusBadge status={editing.priority} />
              {editing.planSnapshot && (
                <span className="text-[10px] text-muted-foreground">
                  {editing.planSnapshot}
                </span>
              )}
              {editing.supportRemaining !== null &&
                editing.supportRemaining !== undefined && (
                  <span
                    className={`text-[10px] ${editing.supportRemaining <= 0 ? "text-rose-500 font-bold" : "text-muted-foreground"}`}
                  >
                    Support allowance: {editing.supportRemaining} of{" "}
                    {editing.supportRemaining +
                      (editing.supportUsedThisMonth ?? 0)}{" "}
                    left this month
                  </span>
                )}
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-[10px] uppercase text-muted-foreground mb-1">
                Issue reported
              </p>
              <p className="text-xs whitespace-pre-wrap">{editing.issue}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  defaultValue={editing.status}
                  onValueChange={(v) => update(editing, { status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select
                  defaultValue={editing.priority}
                  onValueChange={(v) => update(editing, { priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">
                  Work performed (technical notes)
                </Label>
                <Textarea
                  rows={3}
                  defaultValue={editing.workPerformed ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (editing.workPerformed ?? "") &&
                    update(editing, { workPerformed: e.target.value })
                  }
                  placeholder="What was checked, fixed, updated…"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={() => update(editing, { status: "In Progress" })}
              >
                Start work
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update(editing, { status: "Waiting for Client" })
                }
              >
                Waiting for client
              </Button>
              <Button
                size="sm"
                className="brand-gradient-bg text-white"
                onClick={() => update(editing, { status: "Completed" })}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Mark completed
              </Button>
            </div>
          </div>
        )}
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.ticketCode}?`}
        description="This removes the support ticket permanently."
        onConfirm={doDelete}
        confirmLabel="Delete"
        busy={busy}
      />
    </div>
  );
}
