"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Users,
  Loader2,
  Pencil,
  Trash2,
  Archive,
  Download,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Globe,
  MessageCircle,
  Filter,
  FileText,
  Receipt,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { api, fmtSAR, fmtDate, CLIENT_STATUSES, isAdminRole } from "@/lib/client-utils";
import { useApp } from "@/lib/store";
import {
  PageHeader,
  EmptyState,
  StatusBadge,
  EntityDialog,
  ConfirmDialog,
  CommentThread,
  type CommentItem,
} from "@/components/app/shared";

type Client = {
  id: string;
  clientCode: string;
  businessName: string;
  businessCategory?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  location?: string | null;
  city?: string | null;
  mapsUrl?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
  serviceRequested?: string | null;
  quotedPrice?: number | null;
  agreedPrice?: number | null;
  leadSource?: string | null;
  acquisitionDate?: string | null;
  status: string;
  notes?: string | null;
  archived: boolean;
  createdAt: string;
  assignedTo?: { id: string; name: string; avatarUrl?: string } | null;
  _count?: {
    orders: number;
    invoices: number;
    payments: number;
    subscriptions: number;
  };
};
type TeamMember = {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
};

const emptyForm = {
  businessName: "",
  businessCategory: "",
  contactPerson: "",
  phone: "",
  whatsapp: "",
  email: "",
  location: "",
  city: "",
  mapsUrl: "",
  websiteUrl: "",
  instagramUrl: "",
  twitterUrl: "",
  facebookUrl: "",
  linkedinUrl: "",
  serviceRequested: "",
  quotedPrice: "",
  agreedPrice: "",
  leadSource: "",
  acquisitionDate: "",
  assignedToId: "",
  status: "Lead",
  notes: "",
};

export default function ClientsView() {
  const { user, dataVersion, bumpData } = useApp();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [detail, setDetail] = useState<Client | null>(null);

  const canWrite = isAdminRole(user?.role) || user?.role === "ACCOUNTANT";
  const canDelete = isAdminRole(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ clients: Client[] }>(
        `/api/clients?archived=${showArchived}${status !== "all" ? `&status=${encodeURIComponent(status)}` : ""}`,
      );
      setClients(res.clients);
      const t = await api<{ users: TeamMember[] }>("/api/team");
      setTeam(t.users);
    } catch (err) {
      toast({
        title: "Failed to load clients",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [showArchived, status, toast]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) =>
      [
        c.businessName,
        c.clientCode,
        c.contactPerson,
        c.phone,
        c.email,
        c.city,
        c.location,
      ].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [clients, q]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      businessName: c.businessName ?? "",
      businessCategory: c.businessCategory ?? "",
      contactPerson: c.contactPerson ?? "",
      phone: c.phone ?? "",
      whatsapp: c.whatsapp ?? "",
      email: c.email ?? "",
      location: c.location ?? "",
      city: c.city ?? "",
      mapsUrl: c.mapsUrl ?? "",
      websiteUrl: c.websiteUrl ?? "",
      instagramUrl: c.instagramUrl ?? "",
      twitterUrl: c.twitterUrl ?? "",
      facebookUrl: c.facebookUrl ?? "",
      linkedinUrl: c.linkedinUrl ?? "",
      serviceRequested: c.serviceRequested ?? "",
      quotedPrice: c.quotedPrice?.toString() ?? "",
      agreedPrice: c.agreedPrice?.toString() ?? "",
      leadSource: c.leadSource ?? "",
      acquisitionDate: c.acquisitionDate ? c.acquisitionDate.slice(0, 10) : "",
      assignedToId: c.assignedTo?.id ?? "",
      status: c.status,
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.businessName.trim()) {
      toast({ title: "Business name is required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/clients/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...form, archived: editing.archived }),
        });
      } else {
        await api("/api/clients", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      toast({ title: editing ? "Client updated" : "Client created" });
      setDialogOpen(false);
      bumpData();
    } catch (err) {
      toast({
        title: "Could not save client",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await api<{ archived?: boolean; message?: string }>(
        `/api/clients/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      toast({
        title: res.archived ? "Client archived" : "Client deleted",
        description: res.message,
      });
      setDeleteTarget(null);
      setDetail(null);
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
    <div>
      <PageHeader
        title="Clients Database"
        subtitle={`${clients.length} record${clients.length === 1 ? "" : "s"}${showArchived ? " (archived)" : ""}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive className="w-4 h-4 mr-1.5" />
              {showArchived ? "Active view" : "Archived"}
            </Button>
            {canWrite && (
              <Button variant="outline" size="sm" asChild>
                <a href="/api/reports/export?type=clients" download>
                  <Download className="w-4 h-4 mr-1.5" /> Export CSV
                </a>
              </Button>
            )}
            {canWrite && (
              <Button
                size="sm"
                onClick={openCreate}
                className="brand-gradient-bg text-white"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add client
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search business, contact, phone, email…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="w-4 h-4 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CLIENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No clients found"
          hint={
            q || status !== "all"
              ? "Try adjusting the search or filter."
              : "Add your first client to get started."
          }
          icon={<Users className="w-7 h-7" />}
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Contact
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Location
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Service
                  </TableHead>
                  <TableHead>Agreed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Assigned
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="cursor-pointer group"
                    onClick={() => setDetail(c)}
                  >
                    <TableCell>
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                        {c.businessName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.clientCode}
                        {c.businessCategory ? ` · ${c.businessCategory}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-xs">{c.contactPerson ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.phone ?? ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {[c.city, c.location].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-36 truncate">
                      {c.serviceRequested ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {c.agreedPrice != null
                        ? fmtSAR(c.agreedPrice, { compact: true })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.assignedTo ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar className="w-6 h-6">
                            {c.assignedTo.avatarUrl ? (
                              <AvatarImage src={c.assignedTo.avatarUrl} />
                            ) : null}
                            <AvatarFallback className="text-[9px]">
                              {c.assignedTo.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{c.assignedTo.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(c)}
                            aria-label="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-500 hover:text-rose-600"
                            onClick={() => setDeleteTarget(c)}
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Create / edit dialog */}
      <EntityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `Edit ${editing.businessName}` : "Add new client"}
        wide
      >
        <ClientForm form={form} setForm={setForm} team={team} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy}
            className="brand-gradient-bg text-white"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            {editing ? "Save changes" : "Create client"}
          </Button>
        </div>
      </EntityDialog>

      {/* Detail dialog */}
      <EntityDialog
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        title={detail?.businessName ?? ""}
        wide
      >
        {detail && (
          <ClientDetail
            client={detail}
            onEdit={() => {
              openEdit(detail);
              setDetail(null);
            }}
          />
        )}
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.businessName}?`}
        description="If this client has linked orders, invoices or payments they will be archived instead of deleted to preserve business history."
        onConfirm={doDelete}
        confirmLabel="Delete"
        busy={busy}
      />
    </div>
  );
}

function ClientFormField({
  k,
  label,
  form,
  set,
  type = "text",
  placeholder,
}: {
  k: string;
  label: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function ClientForm({
  form,
  setForm,
  team,
}: {
  form: Record<string, string>;
  setForm: (f: Record<string, string>) => void;
  team: TeamMember[];
}) {
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const F = ClientFormField;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <F
          form={form}
          set={set}
          k="businessName"
          label="Business name *"
          placeholder="e.g. Al Baik Restaurant"
        />
        <F
          form={form}
          set={set}
          k="businessCategory"
          label="Business category"
          placeholder="e.g. Restaurant"
        />
        <F
          form={form}
          set={set}
          k="contactPerson"
          label="Owner / contact person"
        />
        <F
          form={form}
          set={set}
          k="phone"
          label="Phone number"
          placeholder="+966 5x xxx xxxx"
        />
        <F form={form} set={set} k="whatsapp" label="WhatsApp number" />
        <F form={form} set={set} k="email" label="Email address" type="email" />
        <F
          form={form}
          set={set}
          k="city"
          label="City"
          placeholder="Dammam / Al Khobar"
        />
        <F form={form} set={set} k="location" label="Location details" />
        <F
          form={form}
          set={set}
          k="mapsUrl"
          label="Google Maps / Business Profile link"
        />
        <F form={form} set={set} k="websiteUrl" label="Website URL" />
        <F form={form} set={set} k="instagramUrl" label="Instagram link" />
        <F form={form} set={set} k="twitterUrl" label="X / Twitter link" />
        <F form={form} set={set} k="facebookUrl" label="Facebook link" />
        <F form={form} set={set} k="linkedinUrl" label="LinkedIn link" />
        <F
          form={form}
          set={set}
          k="serviceRequested"
          label="Service requested"
          placeholder="e.g. Restaurant website"
        />
        <F
          form={form}
          set={set}
          k="leadSource"
          label="Lead source"
          placeholder="Referral / Instagram / Google"
        />
        <F
          form={form}
          set={set}
          k="quotedPrice"
          label="Quoted price (SAR)"
          type="number"
        />
        <F
          form={form}
          set={set}
          k="agreedPrice"
          label="Agreed price (SAR)"
          type="number"
        />
        <F
          form={form}
          set={set}
          k="acquisitionDate"
          label="Client acquisition date"
          type="date"
        />
        <div className="space-y-1">
          <Label className="text-xs">Client status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Assigned team member</Label>
          <Select
            value={form.assignedToId || "none"}
            onValueChange={(v) => set("assignedToId", v === "none" ? "" : v)}
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
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes &amp; communication history</Label>
        <Textarea
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Important conversations, agreements, follow-ups…"
        />
      </div>
    </div>
  );
}

function ClientDetail({
  client,
  onEdit,
}: {
  client: Client;
  onEdit: () => void;
}) {
  const { bumpData } = useApp();
  const [data, setData] = useState<{
    orders: {
      id: string;
      orderCode: string;
      serviceType: string;
      status: string;
      agreedPrice: number;
    }[];
    invoices: {
      id: string;
      invoiceCode: string;
      total: number;
      status: string;
      dueDate: string;
    }[];
    payments: {
      id: string;
      paymentCode: string;
      amount: number;
      direction: string;
      receivedAt: string;
    }[];
    subscriptions: {
      id: string;
      subscriptionCode: string;
      planType: string;
      monthlyFee: number;
      status: string;
    }[];
    comments: CommentItem[];
    files: { id: string; fileName: string; category: string }[];
  } | null>(null);

  useEffect(() => {
    // The API responds with { client: {...} } — unwrap it so data.orders etc. exist.
    api<{ client: typeof data }>(`/api/clients/${client.id}`)
      .then((r) => setData(r.client))
      .catch(() => {});
  }, [client.id, useApp.getState().dataVersion]);

  const Row = ({
    icon,
    label,
    value,
    href,
  }: {
    icon: React.ReactNode;
    label: string;
    value?: string | null;
    href?: string | null;
  }) => (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {href && value ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
          >
            {value}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <p className="text-xs break-words">{value || "—"}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <StatusBadge status={client.status} />
          <span className="text-xs text-muted-foreground">
            {client.clientCode} · acquired{" "}
            {fmtDate(client.acquisitionDate ?? client.createdAt)}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6">
        <Row
          icon={<Phone className="w-3.5 h-3.5" />}
          label="Phone"
          value={client.phone}
        />
        <Row
          icon={<MessageCircle className="w-3.5 h-3.5" />}
          label="WhatsApp"
          value={client.whatsapp}
        />
        <Row
          icon={<Mail className="w-3.5 h-3.5" />}
          label="Email"
          value={client.email}
        />
        <Row
          icon={<MapPin className="w-3.5 h-3.5" />}
          label="Location"
          value={[client.location, client.city].filter(Boolean).join(", ")}
        />
        <Row
          icon={<Globe className="w-3.5 h-3.5" />}
          label="Website"
          value={client.websiteUrl}
          href={client.websiteUrl}
        />
        <Row
          icon={<MapPin className="w-3.5 h-3.5" />}
          label="Google profile"
          value={client.mapsUrl ? "Open link" : null}
          href={client.mapsUrl}
        />
        <Row
          icon={<FileText className="w-3.5 h-3.5" />}
          label="Quoted / agreed"
          value={`${client.quotedPrice != null ? fmtSAR(client.quotedPrice) : "—"} / ${client.agreedPrice != null ? fmtSAR(client.agreedPrice) : "—"}`}
        />
        <Row
          icon={<Users className="w-3.5 h-3.5" />}
          label="Lead source"
          value={client.leadSource}
        />
      </div>

      {client.notes && (
        <div className="rounded-xl bg-muted p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Notes
          </p>
          <p className="text-xs whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      {data && (
        <Tabs defaultValue="orders">
          <TabsList className="w-full flex-wrap h-auto">
            <TabsTrigger value="orders">
              Orders ({data.orders.length})
            </TabsTrigger>
            <TabsTrigger value="invoices">
              Invoices ({data.invoices.length})
            </TabsTrigger>
            <TabsTrigger value="payments">
              Payments ({data.payments.length})
            </TabsTrigger>
            <TabsTrigger value="subs">
              Maintenance ({data.subscriptions.length})
            </TabsTrigger>
            <TabsTrigger value="notes">History</TabsTrigger>
          </TabsList>
          <TabsContent
            value="orders"
            className="space-y-1.5 max-h-52 overflow-y-auto ag-scroll"
          >
            {data.orders.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No orders for this client yet.
              </p>
            )}
            {data.orders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-xs font-semibold">{o.orderCode}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {o.serviceType}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {fmtSAR(o.agreedPrice, { compact: true })}
                  </span>
                  <StatusBadge status={o.status} />
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent
            value="invoices"
            className="space-y-1.5 max-h-52 overflow-y-auto ag-scroll"
          >
            {data.invoices.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No invoices yet.
              </p>
            )}
            {data.invoices.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Receipt className="w-3 h-3" />
                    {i.invoiceCode}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    due {fmtDate(i.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{fmtSAR(i.total)}</span>
                  <StatusBadge status={i.status} />
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent
            value="payments"
            className="space-y-1.5 max-h-52 overflow-y-auto ag-scroll"
          >
            {data.payments.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No payments recorded.
              </p>
            )}
            {data.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2"
              >
                <p className="text-xs">
                  {p.paymentCode} · {fmtDate(p.receivedAt)}
                </p>
                <span
                  className={`text-xs font-bold ${p.direction === "in" ? "text-emerald-500" : "text-rose-500"}`}
                >
                  {p.direction === "in" ? "+" : "−"}
                  {fmtSAR(p.amount)}
                </span>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="subs" className="space-y-1.5">
            {data.subscriptions.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No maintenance subscriptions.
              </p>
            )}
            {data.subscriptions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-xs font-semibold">{s.subscriptionCode}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.planType} plan
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {fmtSAR(s.monthlyFee)}/mo
                  </span>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="notes">
            <CommentThread
              comments={data.comments ?? []}
              endpoint={{ clientId: client.id }}
              onPosted={() => bumpData()}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
