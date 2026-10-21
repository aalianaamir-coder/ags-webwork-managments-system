"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import {
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
  Table2,
  KanbanSquare,
  CalendarDays,
  ExternalLink,
  Link2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
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
  SERVICE_TYPES,
  PRIORITIES,
} from "@/lib/client-utils";
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

type Order = {
  id: string;
  orderCode: string;
  clientId: string;
  serviceType: string;
  description?: string | null;
  developerId?: string | null;
  coordinatorId?: string | null;
  agreedPrice: number;
  startDate?: string | null;
  internalDeadline?: string | null;
  deliveryDate?: string | null;
  priority: string;
  status: string;
  previewUrl?: string | null;
  liveUrl?: string | null;
  repoUrl?: string | null;
  estimatedCompletion?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  paymentsReceived?: number;
  remainingBalance?: number;
  client: {
    id: string;
    clientCode: string;
    businessName: string;
    contactPerson?: string | null;
    phone?: string | null;
  };
  developer?: { id: string; name: string; avatarUrl?: string } | null;
  coordinator?: { id: string; name: string; avatarUrl?: string } | null;
  _count?: { tasks: number; files: number };
};
type ClientOpt = { id: string; businessName: string; clientCode: string };
type TeamMember = { id: string; name: string; role: string };

const WORKFLOW = [
  "Lead Received",
  "Client Contacted",
  "Quotation Sent",
  "Order Confirmed",
  "Development in Progress",
  "Internal Review",
  "Client Review",
  "Revisions",
  "Ready for Delivery",
  "Delivered",
  "Payment Completed",
  "Closed",
];
const DEV_ALLOWED = [
  "Development in Progress",
  "Internal Review",
  "Client Review",
  "Revisions",
  "Ready for Delivery",
  "Delivered",
];

const emptyForm = {
  clientId: "",
  serviceType: SERVICE_TYPES[0],
  description: "",
  developerId: "",
  coordinatorId: "",
  agreedPrice: "",
  startDate: "",
  internalDeadline: "",
  deliveryDate: "",
  priority: "Medium",
  status: "Lead Received",
  previewUrl: "",
  liveUrl: "",
  repoUrl: "",
  estimatedCompletion: "",
};

export default function OrdersView() {
  const { user, dataVersion, bumpData } = useApp();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [priorityF, setPriorityF] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  const isDev = user?.role === "DEVELOPER";
  const canWrite = user?.role === "ADMIN" || user?.role === "ACCOUNTANT";
  const canDelete = user?.role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ orders: Order[] }>("/api/orders");
      setOrders(res.orders);
      if (canWrite) {
        const c = await api<{ clients: ClientOpt[] }>("/api/clients");
        setClients(c.clients);
      }
      const t = await api<{ users: TeamMember[] }>("/api/team");
      setTeam(t.users);
    } catch (err) {
      toast({
        title: "Failed to load orders",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [canWrite, toast]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusF !== "all" && o.status !== statusF) return false;
      if (priorityF !== "all" && o.priority !== priorityF) return false;
      if (!term) return true;
      return [
        o.orderCode,
        o.serviceType,
        o.description,
        o.client?.businessName,
      ].some((v) => v?.toLowerCase().includes(term));
    });
  }, [orders, q, statusF, priorityF]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };
  const openEdit = (o: Order) => {
    setEditing(o);
    setForm({
      clientId: o.clientId,
      serviceType: o.serviceType,
      description: o.description ?? "",
      developerId: o.developerId ?? "",
      coordinatorId: o.coordinatorId ?? "",
      agreedPrice: String(o.agreedPrice ?? ""),
      startDate: o.startDate?.slice(0, 10) ?? "",
      internalDeadline: o.internalDeadline?.slice(0, 10) ?? "",
      deliveryDate: o.deliveryDate?.slice(0, 10) ?? "",
      priority: o.priority,
      status: o.status,
      previewUrl: o.previewUrl ?? "",
      liveUrl: o.liveUrl ?? "",
      repoUrl: o.repoUrl ?? "",
      estimatedCompletion: o.estimatedCompletion?.slice(0, 10) ?? "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.clientId && !editing) {
      toast({ title: "Select a client", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/orders/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await api("/api/orders", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      toast({ title: editing ? "Order updated" : "Order created" });
      setDialogOpen(false);
      bumpData();
    } catch (err) {
      toast({
        title: "Could not save order",
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
      await api(`/api/orders/${deleteTarget.id}`, { method: "DELETE" });
      toast({ title: "Order deleted" });
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

  const moveStatus = async (orderId: string, newStatus: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === newStatus) return;
    try {
      await api(`/api/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      toast({ title: `${order.orderCode} → ${newStatus}` });
      bumpData();
    } catch (err) {
      toast({
        title: "Could not move order",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Orders & Projects"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} in the system`}
        actions={
          canWrite && (
            <Button
              size="sm"
              onClick={openCreate}
              className="brand-gradient-bg text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" /> New order
            </Button>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order code, client, service…"
            className="pl-9"
          />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WORKFLOW.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityF} onValueChange={setPriorityF}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue={isDev ? "kanban" : "table"}>
          <TabsList>
            <TabsTrigger value="table">
              <Table2 className="w-4 h-4 mr-1.5" />
              Table
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <KanbanSquare className="w-4 h-4 mr-1.5" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="w-4 h-4 mr-1.5" />
              Deadlines
            </TabsTrigger>
          </TabsList>

          {/* ---------- TABLE ---------- */}
          <TabsContent value="table">
            {filtered.length === 0 ? (
              <EmptyState
                title="No orders found"
                hint={
                  isDev
                    ? "Projects assigned to you will appear here."
                    : "Create your first order to get started."
                }
                icon={<FolderKanban className="w-7 h-7" />}
              />
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto ag-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="hidden md:table-cell">
                          Developer
                        </TableHead>
                        <TableHead>Price</TableHead>
                        {!isDev && (
                          <TableHead className="hidden sm:table-cell">
                            Balance
                          </TableHead>
                        )}
                        <TableHead className="hidden lg:table-cell">
                          Deadline
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((o) => {
                        const dd = daysUntil(o.internalDeadline);
                        return (
                          <TableRow
                            key={o.id}
                            className="cursor-pointer group"
                            onClick={() => setDetail(o)}
                          >
                            <TableCell>
                              <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                                {o.orderCode}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate max-w-44">
                                {o.serviceType}
                              </p>
                            </TableCell>
                            <TableCell>
                              <p className="text-xs">
                                {o.client?.businessName}
                              </p>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs">
                              {o.developer?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {fmtSAR(o.agreedPrice, { compact: true })}
                            </TableCell>
                            {!isDev && (
                              <TableCell className="hidden sm:table-cell text-xs font-medium text-amber-600 dark:text-amber-400">
                                {fmtSAR(o.remainingBalance ?? 0, {
                                  compact: true,
                                })}
                              </TableCell>
                            )}
                            <TableCell className="hidden lg:table-cell text-xs">
                              {o.internalDeadline ? (
                                <span
                                  className={
                                    dd !== null &&
                                    dd < 0 &&
                                    ![
                                      "Delivered",
                                      "Payment Completed",
                                      "Closed",
                                    ].includes(o.status)
                                      ? "text-rose-500 font-semibold"
                                      : ""
                                  }
                                >
                                  {fmtDate(o.internalDeadline)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={o.status} />
                            </TableCell>
                            <TableCell
                              className="text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex justify-end gap-1">
                                {(canWrite ||
                                  (isDev &&
                                    DEV_ALLOWED.includes(o.status))) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openEdit(o)}
                                    aria-label="Edit"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-500"
                                    onClick={() => setDeleteTarget(o)}
                                    aria-label="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ---------- KANBAN ---------- */}
          <TabsContent value="kanban">
            <KanbanBoard
              orders={filtered}
              onMove={moveStatus}
              onOpen={setDetail}
              canDrag={canWrite || isDev}
              isDev={!!isDev}
            />
          </TabsContent>

          {/* ---------- CALENDAR ---------- */}
          <TabsContent value="calendar">
            <DeadlineCalendar orders={filtered} onOpen={setDetail} />
          </TabsContent>
        </Tabs>
      )}

      {/* Create / edit */}
      <EntityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `Edit ${editing.orderCode}` : "Create new order"}
        wide
      >
        <OrderForm
          form={form}
          setForm={setForm}
          clients={clients}
          team={team}
          isDev={!!isDev}
          editing={editing}
        />
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
            {editing ? "Save changes" : "Create order"}
          </Button>
        </div>
      </EntityDialog>

      {/* Detail */}
      <EntityDialog
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        title={detail ? `${detail.orderCode} — ${detail.serviceType}` : ""}
        wide
      >
        {detail && (
          <OrderDetail
            order={detail}
            onEdit={() => {
              openEdit(detail);
              setDetail(null);
            }}
            onUpdate={(o) => setDetail(o)}
          />
        )}
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.orderCode}?`}
        description="Orders with recorded payments cannot be deleted. This also removes linked tasks, files and revision history."
        onConfirm={doDelete}
        confirmLabel="Delete order"
        busy={busy}
      />
    </div>
  );
}

/* ---------------- Kanban ---------------- */
function KanbanCard({
  order,
  onOpen,
}: {
  order: Order;
  onOpen: (o: Order) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
  });
  const dd = daysUntil(order.internalDeadline);
  const overdue =
    dd !== null &&
    dd < 0 &&
    !["Delivered", "Payment Completed", "Closed"].includes(order.status);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(order)}
      className={`cursor-grab active:cursor-grabbing rounded-xl border bg-card p-3 shadow-sm hover:shadow-md transition-all ${isDragging ? "opacity-50 ring-2 ring-primary" : ""} ${overdue ? "border-rose-500/40" : ""}`}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <p className="text-[11px] font-bold">{order.orderCode}</p>
        <StatusBadge
          status={order.priority === "Urgent" ? "Urgent" : order.priority}
        />
      </div>
      <p className="text-xs font-medium truncate">
        {order.client?.businessName}
      </p>
      <p className="text-[10px] text-muted-foreground truncate">
        {order.serviceType}
      </p>
      {order.internalDeadline && (
        <p
          className={`text-[10px] mt-1.5 ${overdue ? "text-rose-500 font-semibold" : "text-muted-foreground"}`}
        >
          {overdue ? `⚠ ${Math.abs(dd!)}d overdue` : `Due in ${dd}d`} ·{" "}
          {fmtDate(order.internalDeadline)}
        </p>
      )}
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
        <span className="text-[10px] font-semibold">
          {fmtSAR(order.agreedPrice, { compact: true })}
        </span>
        {order.developer && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            👤 {order.developer.name}
          </span>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  orders,
  onOpen,
}: {
  status: string;
  orders: Order[];
  onOpen: (o: Order) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-64 md:min-w-72 w-64 md:w-72 shrink-0 rounded-xl border bg-muted/40 p-2 ${isOver ? "ring-2 ring-primary bg-primary/5" : ""}`}
    >
      <div className="flex items-center justify-between px-2 py-1.5 mb-1">
        <p className="text-xs font-semibold truncate">{status}</p>
        <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
          {orders.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto ag-scroll max-h-[60vh] min-h-24 px-0.5">
        {orders.map((o) => (
          <KanbanCard key={o.id} order={o} onOpen={onOpen} />
        ))}
        {orders.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-6">
            Drop cards here
          </p>
        )}
      </div>
    </div>
  );
}

function KanbanBoard({
  orders,
  onMove,
  onOpen,
  canDrag,
  isDev,
}: {
  orders: Order[];
  onMove: (id: string, s: string) => void;
  onOpen: (o: Order) => void;
  canDrag: boolean;
  isDev: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const stages = isDev ? WORKFLOW.slice(4, 10) : WORKFLOW;
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && typeof e.over.id === "string")
      onMove(String(e.active.id), e.over.id);
  };
  if (!canDrag) {
    return (
      <EmptyState
        title="View-only board"
        hint="Only the CEO, accountant, or the assigned developer can move projects."
        icon={<KanbanSquare className="w-7 h-7" />}
      />
    );
  }
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={onDragEnd}
      collisionDetection={closestCorners}
    >
      <div className="overflow-x-auto ag-scroll pb-3">
        <div className="flex gap-3">
          {stages.map((s) => (
            <KanbanColumn
              key={s}
              status={s}
              orders={orders.filter((o) => o.status === s)}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );
}

/* ---------------- Calendar ---------------- */
function DeadlineCalendar({
  orders,
  onOpen,
}: {
  orders: Order[];
  onOpen: (o: Order) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const year = month.getFullYear(),
    m = month.getMonth();
  const first = new Date(year, m, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday start
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const byDay = (() => {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
      const d = o.internalDeadline ?? o.deliveryDate;
      if (!d) continue;
      const key = new Date(d);
      if (key.getFullYear() === year && key.getMonth() === m) {
        const k = String(key.getDate());
        map.set(k, [...(map.get(k) ?? []), o]);
      }
    }
    return map;
  })();

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year &&
    today.getMonth() === m &&
    today.getDate() === d;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMonth(new Date(year, m - 1, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <p className="font-semibold">
          {month.toLocaleString("en", { month: "long", year: "numeric" })}
        </p>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMonth(new Date(year, m + 1, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div
            key={i}
            className={`min-h-20 md:min-h-24 rounded-lg border p-1 ${d ? "bg-card" : "bg-transparent border-transparent"} ${d && isToday(d) ? "ring-2 ring-primary" : ""}`}
          >
            {d && (
              <>
                <p
                  className={`text-[10px] font-bold px-1 ${isToday(d) ? "text-primary" : "text-muted-foreground"}`}
                >
                  {d}
                </p>
                <div className="space-y-0.5 mt-0.5 max-h-16 overflow-y-auto ag-scroll">
                  {(byDay.get(String(d)) ?? []).map((o) => {
                    const overdue =
                      new Date(o.internalDeadline ?? o.deliveryDate!) <
                        new Date() &&
                      !["Delivered", "Payment Completed", "Closed"].includes(
                        o.status,
                      );
                    return (
                      <button
                        key={o.id}
                        onClick={() => onOpen(o)}
                        className={`w-full text-left text-[9px] leading-tight rounded px-1 py-0.5 truncate hover:bg-accent ${overdue ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-primary/10 text-primary"}`}
                      >
                        {o.orderCode}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Form ---------------- */
function OrderForm({
  form,
  setForm,
  clients,
  team,
  isDev,
  editing,
}: {
  form: Record<string, string>;
  setForm: (f: Record<string, string>) => void;
  clients: ClientOpt[];
  team: TeamMember[];
  isDev: boolean;
  editing: Order | null;
}) {
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const devStatuses = DEV_ALLOWED;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        {!isDev && (
          <div className="space-y-1">
            <Label className="text-xs">Client *</Label>
            <Select
              value={form.clientId}
              onValueChange={(v) => set("clientId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.businessName} ({c.clientCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Service type</Label>
          <Select
            value={form.serviceType}
            onValueChange={(v) => set("serviceType", v)}
            disabled={isDev}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isDev && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Agreed price (SAR)</Label>
              <Input
                type="number"
                value={form.agreedPrice}
                onChange={(e) => set("agreedPrice", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assigned developer</Label>
              <Select
                value={form.developerId || "none"}
                onValueChange={(v) => set("developerId", v === "none" ? "" : v)}
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
              <Label className="text-xs">Responsible coordinator</Label>
              <Select
                value={form.coordinatorId || "none"}
                onValueChange={(v) =>
                  set("coordinatorId", v === "none" ? "" : v)
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
              <Label className="text-xs">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => set("priority", v)}
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
              <Label className="text-xs">
                Status (workflow can be skipped)
              </Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Internal deadline</Label>
              <Input
                type="date"
                value={form.internalDeadline}
                onChange={(e) => set("internalDeadline", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Client delivery date</Label>
              <Input
                type="date"
                value={form.deliveryDate}
                onChange={(e) => set("deliveryDate", e.target.value)}
              />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-xs">
            Estimated completion {isDev && "(developer)"}
          </Label>
          <Input
            type="date"
            value={form.estimatedCompletion}
            onChange={(e) => set("estimatedCompletion", e.target.value)}
          />
        </div>
        {isDev && (
          <div className="space-y-1">
            <Label className="text-xs">Project status</Label>
            <Select
              value={
                devStatuses.includes(form.status) ? form.status : devStatuses[0]
              }
              onValueChange={(v) => set("status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {devStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editing && (
              <p className="text-[10px] text-muted-foreground">
                Developers can set development-stage statuses, links and notes.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          Project description / development notes
        </Label>
        <Textarea
          rows={3}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Scope, requirements, bug reports, delivery notes…"
        />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">
            <Link2 className="w-3 h-3 inline mr-1" />
            Preview URL
          </Label>
          <Input
            value={form.previewUrl}
            onChange={(e) => set("previewUrl", e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            <ExternalLink className="w-3 h-3 inline mr-1" />
            Live URL
          </Label>
          <Input
            value={form.liveUrl}
            onChange={(e) => set("liveUrl", e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            <Link2 className="w-3 h-3 inline mr-1" />
            Repository link
          </Label>
          <Input
            value={form.repoUrl}
            onChange={(e) => set("repoUrl", e.target.value)}
            placeholder="https://github.com/…"
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Detail ---------------- */
function OrderDetail({
  order,
  onEdit,
  onUpdate,
}: {
  order: Order;
  onEdit: () => void;
  onUpdate: (o: Order) => void;
}) {
  const { user, bumpData } = useApp();
  const { toast } = useToast();
  const [data, setData] = useState<{
    order: Order & {
      tasks: {
        id: string;
        taskCode: string;
        title: string;
        status: string;
        assignee?: { name: string };
      }[];
      files: { id: string; fileName: string; category: string; size: number }[];
      comments: CommentItem[];
      revisions: {
        id: string;
        fromStatus?: string;
        toStatus?: string;
        note?: string;
        createdAt: string;
      }[];
      payments?: {
        id: string;
        paymentCode: string;
        amount: number;
        direction: string;
        receivedAt: string;
      }[];
    };
  } | null>(null);

  useEffect(() => {
    api<typeof data>(`/api/orders/${order.id}`)
      .then((r) => setData(r))
      .catch(() => {});
  }, [order.id, useApp.getState().dataVersion]);

  const quickStatus = async (status: string) => {
    try {
      const res = await api<{ order: Order }>(`/api/orders/${order.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast({ title: `Status updated → ${status}` });
      onUpdate(res.order);
      bumpData();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const isDev = user?.role === "DEVELOPER";
  const devStages = DEV_ALLOWED;
  const o = data?.order ?? order;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={o.status} />
          <StatusBadge status={o.priority} />
          <span className="text-xs text-muted-foreground">
            {o.client?.businessName} · created {fmtDate(o.createdAt)}
          </span>
        </div>
        <div className="flex gap-1.5">
          {o.liveUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={o.liveUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Live
              </a>
            </Button>
          )}
          {o.previewUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={o.previewUrl} target="_blank" rel="noreferrer">
                <Link2 className="w-3.5 h-3.5 mr-1.5" />
                Preview
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
        </div>
      </div>

      {o.description && (
        <div className="rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap">
          {o.description}
        </div>
      )}

      {/* Quick status buttons (workflow) */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Workflow
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(isDev ? devStages : WORKFLOW).map((s) => (
            <button
              key={s}
              onClick={() => quickStatus(s)}
              className={`text-[10px] font-semibold rounded-full px-2.5 py-1 border transition-colors ${o.status === s ? "brand-gradient-bg text-white border-transparent" : "hover:bg-accent"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 text-xs">
        <div className="space-y-1.5">
          <p>
            <span className="text-muted-foreground">Agreed price:</span>{" "}
            <b>{fmtSAR(o.agreedPrice)}</b>
          </p>
          {!isDev && data?.order.payments && (
            <>
              <p>
                <span className="text-muted-foreground">Received:</span>{" "}
                <b className="text-emerald-500">
                  {fmtSAR(
                    data.order.payments
                      .filter((p) => p.direction === "in")
                      .reduce((s, p) => s + p.amount, 0),
                  )}
                </b>
              </p>
              <p>
                <span className="text-muted-foreground">Remaining:</span>{" "}
                <b className="text-amber-500">
                  {fmtSAR(o.remainingBalance ?? 0)}
                </b>
              </p>
            </>
          )}
          <p>
            <span className="text-muted-foreground">Developer:</span>{" "}
            {o.developer?.name ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Coordinator:</span>{" "}
            {o.coordinator?.name ?? "—"}
          </p>
        </div>
        <div className="space-y-1.5">
          <p>
            <span className="text-muted-foreground">Start:</span>{" "}
            {fmtDate(o.startDate)}
          </p>
          <p>
            <span className="text-muted-foreground">Internal deadline:</span>{" "}
            {fmtDate(o.internalDeadline)}
          </p>
          <p>
            <span className="text-muted-foreground">Delivery date:</span>{" "}
            {fmtDate(o.deliveryDate)}
          </p>
          <p>
            <span className="text-muted-foreground">Estimated completion:</span>{" "}
            {fmtDate(o.estimatedCompletion)}
          </p>
          {o.deliveredAt && (
            <p>
              <span className="text-muted-foreground">Delivered:</span>{" "}
              {fmtDate(o.deliveredAt)}
            </p>
          )}
        </div>
      </div>

      {data && (
        <Tabs defaultValue="revisions">
          <TabsList className="w-full flex-wrap h-auto">
            <TabsTrigger value="revisions">
              History ({data.order.revisions.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks ({data.order.tasks.length})
            </TabsTrigger>
            <TabsTrigger value="files">
              Files ({data.order.files.length})
            </TabsTrigger>
            {!isDev && (
              <TabsTrigger value="payments">
                Payments ({data.order.payments?.length ?? 0})
              </TabsTrigger>
            )}
            <TabsTrigger value="comments">Comments</TabsTrigger>
          </TabsList>
          <TabsContent
            value="revisions"
            className="space-y-1.5 max-h-48 overflow-y-auto ag-scroll"
          >
            {data.order.revisions.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No status changes recorded yet.
              </p>
            )}
            {data.order.revisions.map((r) => (
              <div
                key={r.id}
                className="text-xs border rounded-lg px-3 py-2 flex items-center justify-between gap-2"
              >
                <span>
                  {r.fromStatus} → <b>{r.toStatus}</b>
                  {r.note ? ` · ${r.note}` : ""}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {fmtDate(r.createdAt)}
                </span>
              </div>
            ))}
          </TabsContent>
          <TabsContent
            value="tasks"
            className="space-y-1.5 max-h-48 overflow-y-auto ag-scroll"
          >
            {data.order.tasks.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No tasks linked.
              </p>
            )}
            {data.order.tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2"
              >
                <p className="text-xs">
                  {t.taskCode} · {t.title}
                </p>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </TabsContent>
          <TabsContent
            value="files"
            className="space-y-1.5 max-h-48 overflow-y-auto ag-scroll"
          >
            {data.order.files.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No files. Upload from the Files module.
              </p>
            )}
            {data.order.files.map((f) => (
              <a
                key={f.id}
                href={`/api/files/${f.id}/download`}
                className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 hover:bg-accent text-xs"
              >
                <span className="truncate">{f.fileName}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {(f.size / 1024).toFixed(0)} KB · {f.category}
                </span>
              </a>
            ))}
          </TabsContent>
          {!isDev && (
            <TabsContent
              value="payments"
              className="space-y-1.5 max-h-48 overflow-y-auto ag-scroll"
            >
              {(data.order.payments ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  No payments recorded for this order.
                </p>
              )}
              {(data.order.payments ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-xs"
                >
                  <span>
                    {p.paymentCode} · {fmtDate(p.receivedAt)}
                  </span>
                  <span
                    className={
                      p.direction === "in"
                        ? "text-emerald-500 font-semibold"
                        : "text-rose-500 font-semibold"
                    }
                  >
                    {p.direction === "in" ? "+" : "−"}
                    {fmtSAR(p.amount)}
                  </span>
                </div>
              ))}
            </TabsContent>
          )}
          <TabsContent value="comments">
            <CommentThread
              comments={data.order.comments}
              endpoint={{ orderId: order.id }}
              onPosted={async () => {
                const r = await api<typeof data>(`/api/orders/${order.id}`);
                setData(r);
              }}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
