'use client'

// AGS WEBWORKS — Business Management System (single-page app entry)
// Made by Aaliyan Aamir

import { useEffect, useState } from 'react'
import { ThemeProvider } from 'next-themes'
import { useApp, type SessionUser } from '@/lib/store'
import { api } from '@/lib/client-utils'
import { LoginView, ChangePasswordView } from '@/components/app/LoginView'
import AppShell from '@/components/app/AppShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import dynamic from 'next/dynamic'
import { Loader2, KeyRound, ArrowLeft } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// Heavy WebGL shader background — only needed on the auth screens.
const WebGLBackground = dynamic(() => import('@/components/app/WebGLBackground'), {
  ssr: false,
  loading: () => null,
})

export default function Page() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" themes={['dark', 'light', 'morning']} enableSystem={false}>
      <AuthGate />
    </ThemeProvider>
  )
}

function AuthGate() {
  const { user, setUser, authChecked, setAuthChecked } = useApp()
  const [mode, setMode] = useState<'login' | 'reset'>('login')

  useEffect(() => {
    api<{ user: SessionUser | null }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true))
  }, [setUser, setAuthChecked])

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-256.png" alt="AGS WEBWORKS" className="w-16 h-16 rounded-xl ring-1 ring-border" />
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (!user) {
    if (mode === 'reset') {
      return <ResetPasswordView onBack={() => setMode('login')} onDone={(u) => setUser(u)} />
    }
    return <LoginView onLoggedIn={(u) => setUser(u)} onForgot={() => setMode('reset')} />
  }

  if (user.mustChangePassword) {
    return <ChangePasswordView user={user} onDone={(u) => setUser(u)} />
  }

  // NOTE: no key={view} here — AppShell switches views internally; remounting
  // the whole shell on every tab change was the main cause of slow navigation.
  return <AppShell user={user} onLogout={logout} onPasswordChanged={(u) => setUser(u)} />
}

/** Public reset flow: username + one-time code issued by the administrator. */
function ResetPasswordView({ onBack, onDone }: { onBack: () => void; onDone: (u: SessionUser) => void }) {
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ action: 'confirm', username, code, newPassword }),
      })
      const res = await api<{ user: SessionUser }>('/api/auth/me')
      toast({ title: 'Password reset', description: 'Welcome back! You are now signed in.' })
      onDone(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <WebGLBackground intensity={0.2} />
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <img src="/logo-256.png" alt="AGS" className="w-10 h-10 rounded-lg ring-1 ring-border" />
          <div>
            <h2 className="text-base font-semibold">Reset your password</h2>
            <p className="text-xs text-muted-foreground">Use the one-time code issued by your administrator.</p>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Your username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-10 bg-background" placeholder="sharjeel / gufran / addan" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Reset code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-10 bg-background font-mono tracking-[0.3em]" placeholder="XXXXXXXXXX" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-10 bg-background" required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Confirm</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} className="h-10 bg-background" required minLength={8} />
            </div>
          </div>
          {error && <p className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/25 rounded-md px-3 py-2">{error}</p>}
          <Button type="submit" disabled={busy || newPassword !== confirmPassword} className="w-full h-10 font-medium">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Reset password &amp; sign in
          </Button>
          <Button type="button" variant="ghost" onClick={onBack} className="w-full text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1.5" />Back to sign in
          </Button>
        </div>
      </form>
    </div>
  )
}
