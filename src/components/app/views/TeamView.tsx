"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  KeyRound,
  ShieldCheck,
  Copy,
  Check,
  UserCog,
  Activity,
  UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api, fmtDateTime, timeAgo } from "@/lib/client-utils";
import { useApp, type SessionUser } from "@/lib/store";
import { PageHeader, EntityDialog } from "@/components/app/shared";
import { AvatarUploader } from "@/components/app/views/SettingsView";

type Member = {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  jobTitle: string;
  avatarUrl?: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  openOrders: number;
  openTasks: number;
  overdueTasks: number;
};
type Log = {
  id: string;
  summary: string;
  createdAt: string;
  user?: { name: string; avatarUrl?: string } | null;
  action: string;
  entity: string;
};

export default function TeamView({
  onPasswordChanged,
}: {
  onPasswordChanged?: (u: SessionUser) => void;
}) {
  const { user } = useApp();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [resetCode, setResetCode] = useState<{
    name: string;
    code: string;
  } | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    username: "",
    email: "",
    role: "DEVELOPER",
    jobTitle: "",
  });
  const [createdCreds, setCreatedCreds] = useState<{
    name: string;
    username: string;
    tempPassword: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ users: Member[]; canManage: boolean }>(
        "/api/team",
      );
      setMembers(res.users);
      setCanManage(res.canManage);
      if (res.canManage) {
        const l = await api<{ logs: Log[] }>("/api/activity?limit=40");
        setLogs(l.logs);
      }
    } catch (err) {
      toast({
        title: "Failed to load team",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const updateMember = async (m: Member, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api("/api/team", {
        method: "PUT",
        body: JSON.stringify({ userId: m.id, ...patch }),
      });
      toast({ title: `${m.name} updated` });
      setEditMember(null);
      load();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const createMember = async () => {
    setBusy(true);
    try {
      const res = await api<{
        user: { name: string; username: string };
        tempPassword: string;
      }>("/api/team", {
        method: "POST",
        body: JSON.stringify(addForm),
      });
      setCreatedCreds({
        name: res.user.name,
        username: res.user.username,
        tempPassword: res.tempPassword,
      });
      setAddOpen(false);
      setAddForm({
        name: "",
        username: "",
        email: "",
        role: "DEVELOPER",
        jobTitle: "",
      });
      load();
    } catch (err) {
      toast({
        title: "Could not create member",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const issueResetCode = async (m: Member) => {
    setBusy(true);
    try {
      const res = await api<{ code: string; message: string }>(
        "/api/auth/reset-password",
        {
          method: "POST",
          body: JSON.stringify({ action: "generate", userId: m.id }),
        },
      );
      setResetCode({ name: m.name, code: res.code });
    } catch (err) {
      toast({
        title: "Could not generate code",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Team Members"
          subtitle="Roles, workload and account management"
        />
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)} className="mt-1">
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add member
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {members.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                {canManage ? (
                  <AvatarUploader targetUser={m} size={56} />
                ) : (
                  <Avatar className="w-14 h-14 ring-1 ring-border">
                    {m.avatarUrl ? (
                      <AvatarImage src={m.avatarUrl} alt={m.name} />
                    ) : null}
                    <AvatarFallback>
                      {m.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{m.name}</p>
                    {!m.isActive && (
                      <Badge variant="destructive" className="text-[9px]">
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.jobTitle}
                  </p>
                  <Badge
                    variant={m.role === "ADMIN" ? "default" : "secondary"}
                    className="mt-1.5 text-[10px]"
                  >
                    {m.role}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="rounded-md bg-muted py-2">
                  <p className="text-lg font-semibold">{m.openOrders}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">
                    Projects
                  </p>
                </div>
                <div className="rounded-md bg-muted py-2">
                  <p className="text-lg font-semibold">{m.openTasks}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">
                    Tasks
                  </p>
                </div>
                <div
                  className={`rounded-md py-2 ${m.overdueTasks > 0 ? "bg-[var(--chart-5)]/10" : "bg-muted"}`}
                >
                  <p
                    className={`text-lg font-semibold ${m.overdueTasks > 0 ? "text-[var(--chart-5)]" : ""}`}
                  >
                    {m.overdueTasks}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase">
                    Overdue
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {m.lastLoginAt
                  ? `Last login ${timeAgo(m.lastLoginAt)}`
                  : "Never logged in"}
                {m.mustChangePassword && " · password change pending"}
              </p>

              {canManage && m.id !== user?.id && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditMember(m)}
                  >
                    <UserCog className="w-3.5 h-3.5 mr-1.5" />
                    Manage
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => issueResetCode(m)}
                  >
                    <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                    Reset pwd
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity log — admin only */}
      {canManage && (
        <Card className="mt-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Activity log — who changed what, and when
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto ag-scroll space-y-1">
            {logs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                No activity yet.
              </p>
            )}
            {logs.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-2.5 py-1.5 border-b last:border-0"
              >
                {l.user?.avatarUrl ? (
                  <img
                    src={l.user.avatarUrl}
                    alt=""
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">{l.summary}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {l.user?.name ?? "System"} · {l.action} {l.entity} ·{" "}
                    {fmtDateTime(l.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Edit member */}
      <EntityDialog
        open={!!editMember}
        onOpenChange={(v) => !v && setEditMember(null)}
        title={`Manage ${editMember?.name ?? ""}`}
      >
        {editMember && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select
                defaultValue={editMember.role}
                onValueChange={(v) => updateMember(editMember, { role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">
                    ADMIN — CEO (full access)
                  </SelectItem>
                  <SelectItem value="DEVELOPER">
                    DEVELOPER — assigned projects only
                  </SelectItem>
                  <SelectItem value="ACCOUNTANT">
                    ACCOUNTANT — financial &amp; order records
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Job title</Label>
              <Input
                defaultValue={editMember.jobTitle}
                onBlur={(e) =>
                  e.target.value !== editMember.jobTitle &&
                  updateMember(editMember, { jobTitle: e.target.value })
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Account active</p>
                <p className="text-xs text-muted-foreground">
                  Disabled accounts cannot sign in.
                </p>
              </div>
              <Switch
                checked={editMember.isActive}
                onCheckedChange={(v) =>
                  updateMember(editMember, { isActive: v })
                }
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Role changes take effect on the member&apos;s next page action.
              Password changes force all their sessions to sign out.
            </p>
          </div>
        )}
      </EntityDialog>

      {/* Add member */}
      <EntityDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add a new team member"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Full name *</Label>
            <Input
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="e.g. Sarah Ahmed"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Username *</Label>
              <Input
                value={addForm.username}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    username: e.target.value.toLowerCase(),
                  })
                }
                placeholder="sarah"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email (optional)</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm({ ...addForm, email: e.target.value })
                }
                placeholder="sarah@company.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Role *</Label>
              <Select
                value={addForm.role}
                onValueChange={(v) => setAddForm({ ...addForm, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">
                    ADMIN — CEO (full access)
                  </SelectItem>
                  <SelectItem value="DEVELOPER">
                    DEVELOPER — assigned projects only
                  </SelectItem>
                  <SelectItem value="ACCOUNTANT">
                    ACCOUNTANT — financial &amp; order records
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Job title</Label>
              <Input
                value={addForm.jobTitle}
                onChange={(e) =>
                  setAddForm({ ...addForm, jobTitle: e.target.value })
                }
                placeholder="e.g. Web Developer"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A strong temporary password will be generated and shown once — the
            new member must change it at first sign-in.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createMember}
              disabled={busy || !addForm.name || !addForm.username}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Create member
            </Button>
          </div>
        </div>
      </EntityDialog>

      {/* New account credentials reveal */}
      <EntityDialog
        open={!!createdCreds}
        onOpenChange={(v) => !v && setCreatedCreds(null)}
        title={`Account created — ${createdCreds?.name ?? ""}`}
      >
        {createdCreds && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Share these one-time credentials with{" "}
              <span className="font-medium text-foreground">
                {createdCreds.name}
              </span>{" "}
              over a secure channel. The password is shown only this once and
              must be changed at first sign-in.
            </p>
            <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Username
              </p>
              <p className="font-mono text-lg font-semibold">
                {createdCreds.username}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1">
                Temporary password
              </p>
              <p className="font-mono text-lg font-semibold break-all text-primary">
                {createdCreds.tempPassword}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${createdCreds.username} / ${createdCreds.tempPassword}`,
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <Check className="w-4 h-4 mr-1.5" />
              ) : (
                <Copy className="w-4 h-4 mr-1.5" />
              )}
              {copied ? "Copied!" : "Copy username & password"}
            </Button>
          </div>
        )}
      </EntityDialog>

      {/* Reset code reveal */}
      <EntityDialog
        open={!!resetCode}
        onOpenChange={(v) => !v && setResetCode(null)}
        title={`Reset code for ${resetCode?.name ?? ""}`}
      >
        {resetCode && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Share this one-time code with {resetCode.name} over a secure
              channel (WhatsApp / in person). It expires in 30 minutes.
            </p>
            <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
              <p className="font-mono text-2xl font-semibold tracking-[0.3em] text-primary">
                {resetCode.code}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(resetCode.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <Check className="w-4 h-4 mr-1.5" />
              ) : (
                <Copy className="w-4 h-4 mr-1.5" />
              )}
              {copied ? "Copied!" : "Copy code"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              The member uses it from the login screen → &ldquo;Forgot
              password?&rdquo; flow.
            </p>
          </div>
        )}
      </EntityDialog>
    </div>
  );
}
