"use client";

import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  Save,
  KeyRound,
  Building2,
  Globe,
  Percent,
  CalendarClock,
  Camera,
  Trash2,
  Check,
  Moon,
  Sun,
  Sunrise,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/client-utils";
import { useApp, type SessionUser } from "@/lib/store";
import { PageHeader } from "@/components/app/shared";

type Settings = Record<string, unknown>;

export default function SettingsView({
  user,
  onPasswordChanged,
}: {
  user: SessionUser;
  onPasswordChanged?: (u: SessionUser) => void;
}) {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your profile, appearance, business configuration and system options"
      />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">My profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="password">Security</TabsTrigger>
          {user.role === "ADMIN" && (
            <TabsTrigger value="business">Business</TabsTrigger>
          )}
          {user.role === "ADMIN" && (
            <TabsTrigger value="system">System</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab user={user} />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="password">
          <PasswordTab onDone={onPasswordChanged} />
        </TabsContent>
        {user.role === "ADMIN" && (
          <TabsContent value="business">
            <BusinessTab />
          </TabsContent>
        )}
        {user.role === "ADMIN" && (
          <TabsContent value="system">
            <SystemTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/** Upload / remove a profile picture for the signed-in user. */
export function AvatarUploader({
  targetUser,
  onUpdated,
  size = 80,
}: {
  targetUser:
    | SessionUser
    | { id: string; name: string; username: string; avatarUrl?: string | null };
  onUpdated?: (u: SessionUser) => void;
  size?: number;
}) {
  const { toast } = useToast();
  const { setUser } = useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "Invalid image",
        description: "Profile pictures must be JPG, PNG or WebP.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Please pick an image under 2 MB.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const isSelf = targetUser.id === useApp.getState().user?.id;
      if (!isSelf) form.append("userId", targetUser.id);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      setPreview(data.user.avatarUrl);
      if (isSelf && onUpdated) {
        onUpdated(data.user as SessionUser);
        setUser(data.user as SessionUser);
      }
      toast({
        title: "Profile picture updated",
        description: isSelf ? undefined : `Updated for ${targetUser.name}.`,
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const isSelf = targetUser.id === useApp.getState().user?.id;
      const res = await fetch(
        `/api/profile/avatar${isSelf ? "" : `?userId=${targetUser.id}`}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? `Reset failed (${res.status})`);
      setPreview(data.user.avatarUrl);
      if (isSelf && onUpdated) {
        onUpdated(data.user as SessionUser);
        setUser(data.user as SessionUser);
      }
      toast({ title: "Picture reset to default" });
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const src = preview ?? targetUser.avatarUrl ?? null;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className="relative rounded-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Change profile picture"
        style={{ width: size, height: size }}
      >
        <Avatar className="w-full h-full ring-1 ring-border">
          {src ? <AvatarImage src={src} alt={targetUser.name} /> : null}
          <AvatarFallback className="text-xl">
            {targetUser.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Camera className="w-5 h-5" />
          )}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-3 text-[11px]">
        <button
          type="button"
          className="text-primary hover:underline underline-offset-2"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          Upload new
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-[var(--destructive)] hover:underline underline-offset-2 inline-flex items-center gap-1"
          onClick={remove}
          disabled={busy}
        >
          <Trash2 className="w-3 h-3" />
          Reset
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        JPG, PNG or WebP — max 2 MB
      </p>
    </div>
  );
}

function ProfileTab({ user }: { user: SessionUser }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <AvatarUploader targetUser={user} size={96} />
          <div className="min-w-0">
            <p className="font-semibold text-lg">{user.name}</p>
            <p className="text-xs text-muted-foreground">
              {user.email} · @{user.username}
            </p>
            <Badge variant="secondary" className="mt-1.5 text-[10px]">
              {user.role} — {user.jobTitle}
            </Badge>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-6 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">
              Role permissions
            </p>
            <p className="text-xs mt-1">
              {user.role === "ADMIN"
                ? "Full administrative access to every module."
                : user.role === "DEVELOPER"
                  ? "Assigned projects, development updates, maintenance tickets."
                  : "Orders, payments, invoices, expenses, maintenance billing."}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">
              Workspace
            </p>
            <p className="text-xs mt-1">
              Currency: SAR · Timezone: Asia/Riyadh · Language: EN / AR
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useApp();
  // hydration-safe client mount check (no setState inside effect)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const current = mounted ? (theme ?? "dark") : "dark";

  const themes: {
    value: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    swatch: string[];
  }[] = [
    {
      value: "dark",
      label: "Dark",
      description: "Charcoal professional — best for long days",
      icon: <Moon className="w-4 h-4" />,
      swatch: ["#0b0e14", "#11151d", "#2f81f7"],
    },
    {
      value: "morning",
      label: "Morning",
      description: "Warm sunrise tones for early starts",
      icon: <Sunrise className="w-4 h-4" />,
      swatch: ["#faf7f1", "#f4eee3", "#b45309"],
    },
    {
      value: "light",
      label: "Light",
      description: "Clean neutral gray",
      icon: <Sun className="w-4 h-4" />,
      swatch: ["#f6f8fa", "#ffffff", "#0969da"],
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sun className="w-4 h-4 text-primary" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-xs">Theme</Label>
          <div className="grid sm:grid-cols-3 gap-3 mt-2">
            {themes.map((th) => (
              <button
                key={th.value}
                type="button"
                onClick={() => setTheme(th.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${current === th.value ? "border-primary ring-1 ring-ring" : "hover:border-muted-foreground/40"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {th.icon}
                    {th.label}
                  </span>
                  {current === th.value && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {th.description}
                </p>
                <div className="flex gap-1 mt-2.5">
                  {th.swatch.map((c) => (
                    <span
                      key={c}
                      className="w-4 h-4 rounded-sm border border-black/10"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Language</Label>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant={lang === "en" ? "default" : "outline"}
              onClick={() => setLang("en")}
            >
              English
            </Button>
            <Button
              size="sm"
              variant={lang === "ar" ? "default" : "outline"}
              onClick={() => setLang("ar")}
            >
              العربية
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Arabic switches the interface to right-to-left.
          </p>
        </div>
        <div className="rounded-lg border p-3 flex items-start gap-3">
          <UserRound className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Your theme and language preferences are stored on this device and
            apply every time you sign in.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordTab({ onDone }: { onDone?: (u: SessionUser) => void }) {
  const { toast } = useToast();
  const { user } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        }),
      });
      toast({
        title: "Password changed",
        description: "All other sessions were signed out.",
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      if (user && onDone) onDone({ ...user, mustChangePassword: false });
    } catch (err) {
      toast({
        title: "Could not change password",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          Change password
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div className="space-y-1">
          <Label className="text-xs">Current password</Label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">New password (min 8 chars)</Label>
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Confirm new password</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button
          onClick={submit}
          disabled={busy || !current || !next || next !== confirm}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Update
          password
        </Button>
      </CardContent>
    </Card>
  );
}

function BusinessTab() {
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: Settings }>("/api/settings")
      .then((r) => setS(r.settings))
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(s) });
      toast({ title: "Settings saved" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!s)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );

  const F = ({
    k,
    label,
    type = "text",
    icon,
  }: {
    k: string;
    label: string;
    type?: string;
    icon?: React.ReactNode;
  }) => (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <Input
        type={type}
        value={String(s[k] ?? "")}
        onChange={(e) => setS({ ...s, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Company details (appear on invoices)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <F k="companyName" label="Company name" />
          <F k="tagline" label="Tagline" />
          <F k="email" label="Email" type="email" />
          <F k="phone" label="Phone" />
          <F k="website" label="Website" />
          <F k="crNumber" label="CR number (optional)" />
          <F k="vatNumber" label="VAT number (optional)" />
          <F k="address" label="Address" />
          <F k="city" label="City" />
          <F k="country" label="Country" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4 text-primary" />
            VAT / tax
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">Enable VAT on invoices</p>
              <p className="text-xs text-muted-foreground">
                Applies to new project &amp; maintenance invoices when legally
                applicable.
              </p>
            </div>
            <Switch
              checked={!!s.vatEnabled}
              onCheckedChange={(v) => setS({ ...s, vatEnabled: v })}
            />
          </div>
          <div className="max-w-40">
            <F k="vatRate" label="VAT rate (%)" type="number" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <F k="currency" label="Currency" />
          <F k="timezone" label="Timezone" />
          <div className="space-y-1">
            <Label className="text-xs">Default language</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={String(s.defaultLanguage)}
              onChange={(e) => setS({ ...s, defaultLanguage: e.target.value })}
            >
              <option value="en">English</option>
              <option value="ar">العربية (Arabic)</option>
            </select>
          </div>
          <F
            k="paymentInstructions"
            label="Payment instructions (on invoices)"
          />
          <F k="invoiceFooter" label="Invoice footer note" />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}

function SystemTab() {
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [scheduler, setScheduler] = useState<{
    schedulerEnabled: boolean;
    lastRunAt: string | null;
    subscriptionsDue: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ settings: Settings }>("/api/settings").catch(
      () => null,
    );
    if (r) setS(r.settings);
    const sc = await api<{
      schedulerEnabled: boolean;
      lastRunAt: string | null;
      subscriptionsDue: number;
    }>("/api/maintenance/scheduler/run").catch(() => null);
    if (sc) setScheduler(sc);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setBusy(true);
    try {
      const res = await api<{
        created: number;
        overdueMarked: number;
        processed: number;
      }>("/api/maintenance/scheduler/run", { method: "POST" });
      toast({
        title: "Scheduler run complete",
        description: `${res.created} invoice(s) generated, ${res.overdueMarked} marked overdue.`,
      });
      load();
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

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(s) });
      toast({ title: "System settings saved" });
    } finally {
      setBusy(false);
    }
  };

  if (!s)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            Recurring maintenance billing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium">
                Automatic monthly invoice generation
              </p>
              <p className="text-xs text-muted-foreground">
                Runs automatically while a CEO or accountant is signed in (every
                5 minutes), and can use a server cron job in production.
              </p>
            </div>
            <Switch
              checked={!!s.schedulerEnabled}
              onCheckedChange={(v) => setS({ ...s, schedulerEnabled: v })}
            />
          </div>
          {scheduler && (
            <div className="rounded-xl bg-muted p-3 text-xs space-y-1">
              <p>
                Last scheduler run:{" "}
                <b>
                  {scheduler.lastRunAt
                    ? new Date(scheduler.lastRunAt).toLocaleString("en-GB")
                    : "never"}
                </b>
              </p>
              <p>
                Subscriptions currently due for invoicing:{" "}
                <b>{scheduler.subscriptionsDue}</b>
              </p>
              <p className="text-muted-foreground">
                Production cron:{" "}
                <code className="font-mono">
                  0 3 1 * * curl -X POST
                  https://your-domain/api/maintenance/scheduler/run
                </code>{" "}
                (with an authenticated session or scheduler key).
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={runNow}
              disabled={busy}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Run scheduler now
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ID prefixes</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          {(
            [
              "clientPrefix",
              "orderPrefix",
              "invoicePrefix",
              "maintInvoicePrefix",
            ] as const
          ).map((k) => (
            <div className="space-y-1" key={k}>
              <Label className="text-xs">
                {k.replace("Prefix", " prefix")}
              </Label>
              <Input
                value={String(s[k] ?? "")}
                onChange={(e) => setS({ ...s, [k]: e.target.value })}
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Applies to newly generated record IDs (existing records keep their
            codes).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
