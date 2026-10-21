'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, User, Eye, EyeOff, ShieldCheck, Loader2, KeyRound } from 'lucide-react'
import WebGLBackground from '@/components/app/WebGLBackground'
import { api } from '@/lib/client-utils'
import type { SessionUser } from '@/lib/store'

export function LoginView({ onLoggedIn, onForgot }: { onLoggedIn: (user: SessionUser) => void; onForgot?: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api<{ user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      onLoggedIn(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Subtle, professional shader backdrop — kept calm on purpose */}
      <WebGLBackground intensity={0.25} />
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-white/10 bg-card/95 backdrop-blur-sm shadow-lg overflow-hidden">
          <div className="p-8">
            <div className="flex flex-col items-center text-center gap-4">
              <img
                src="/logo-256.png"
                alt="AGS WEBWORKS logo"
                className="w-16 h-16 rounded-xl ring-1 ring-border"
              />
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  AGS WEBWORKS
                </h1>
                <p className="text-[11px] tracking-[0.22em] text-muted-foreground mt-1 uppercase">Management System</p>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Authorized team members only — Saudi Arabia
              </p>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-muted-foreground text-xs">Username or email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-9 h-10 bg-background"
                    placeholder="sharjeel / gufran / addan"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-muted-foreground text-xs">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10 h-10 bg-background"
                    placeholder="••••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/25 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy} className="w-full h-10 font-medium">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-5 text-center text-[10px] text-muted-foreground">
              Forgot your password?{' '}
              <button type="button" onClick={onForgot} className="text-primary hover:underline">
                Use a reset code
              </button>{' '}
              — ask the CEO to issue one.
            </p>
          </div>
          <div className="px-8 py-3 border-t flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Your Website • Our Expertise</span>
            <span className="text-[10px] text-muted-foreground">Made by Aaliyan Aamir</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Forced password change on first login / after admin reset. */
export function ChangePasswordView({
  user,
  onDone,
}: {
  user: SessionUser
  onDone: (user: SessionUser) => void
}) {
  const [currentPassword, setCurrent] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      onDone({ ...user, mustChangePassword: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <WebGLBackground intensity={0.2} />
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <img src="/logo-256.png" alt="AGS" className="w-10 h-10 rounded-lg ring-1 ring-border" />
          <div>
            <h2 className="text-base font-semibold">Set a new password</h2>
            <p className="text-xs text-muted-foreground">Welcome, {user.name}. Choose a strong password to continue.</p>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">
              {user.mustChangePassword ? 'Current password (the one you just used)' : 'Current password'}
            </Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className="h-10 bg-background" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">New password (min 8 characters)</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} className="h-10 bg-background" required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Confirm new password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} className="h-10 bg-background" required minLength={8} />
          </div>
          {error && <p className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/25 rounded-md px-3 py-2">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full h-10 font-medium">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save password &amp; continue
          </Button>
        </form>
      </div>
    </div>
  )
}
