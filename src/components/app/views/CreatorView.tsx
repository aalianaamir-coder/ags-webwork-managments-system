'use client'

// THE CREATOR — interactive page about Aaliyan Aamir
// hacker-style typing terminal, WebGL aurora, glitch title, skill bars,
// sliding scroll sections and two mini-games. Made to be fun.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import WebGLBackground from '@/components/app/WebGLBackground'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/lib/store'
import { ArrowLeft, Bug, Keyboard, Trophy, RotateCcw, ChevronDown, Terminal, Code2, Rocket, GraduationCap, MapPin, Zap, Heart, Coffee } from 'lucide-react'

/* ---------------- typing terminal ---------------- */
const TERMINAL_LINES = [
  { text: 'agswebworks@core:~$ whoami', type: 'cmd' },
  { text: 'AALIYAN AAMIR', type: 'big' },
  { text: 'agswebworks@core:~$ cat profile.txt', type: 'cmd' },
  { text: '» 17-year-old high school student', type: 'out' },
  { text: '» Self-taught developer & designer', type: 'out' },
  { text: '» Built the AGS WEBWORKS management system', type: 'out' },
  { text: '» Full-stack: Next.js · TypeScript · Prisma · UI/UX', type: 'out' },
  { text: 'agswebworks@core:~$ mission --status', type: 'cmd' },
  { text: '[OK] Ship real software, not demos.', type: 'ok' },
  { text: '[OK] Make it beautiful and animated.', type: 'ok' },
  { text: '[OK] Prove age is just a number.', type: 'ok' },
  { text: 'agswebworks@core:~$ sudo unlock potential', type: 'cmd' },
  { text: 'Access granted. Welcome to my world. ⚡', type: 'ok' },
]

function useTypedTerminal(lines: typeof TERMINAL_LINES, speed = 26) {
  const [display, setDisplay] = useState<{ text: string; type: string }[]>([])
  const [done, setDone] = useState(false)
  useEffect(() => {
    let li = 0, ci = 0, cancelled = false
    const tick = () => {
      if (cancelled) return
      if (li >= lines.length) { setDone(true); return }
      const line = lines[li]
      if (ci <= line.text.length) {
        setDisplay((d) => {
          const copy = [...d]
          copy[li] = { text: line.text.slice(0, ci), type: line.type }
          return copy
        })
        ci++
        setTimeout(tick, line.type === 'big' ? 65 : speed)
      } else {
        li++; ci = 0
        setTimeout(tick, line.type === 'cmd' ? 350 : 120)
      }
    }
    const start = setTimeout(tick, 600)
    return () => { cancelled = true; clearTimeout(start) }
  }, [lines, speed])
  return { display, done }
}

/* ---------------- Bug Squasher game ---------------- */
function BugSquasher() {
  const [score, setScore] = useState(0)
  const [time, setTime] = useState(20)
  const [playing, setPlaying] = useState(false)
  const [bug, setBug] = useState({ x: 50, y: 50, id: 0 })
  const [best, setBest] = useState(0)

  useEffect(() => {
    if (!playing || time <= 0) return
    const t = setTimeout(() => setTime((x) => x - 1), 1000)
    return () => clearTimeout(t)
  }, [playing, time])

  const start = () => { setScore(0); setTime(20); setPlaying(true); moveBug() }
  const moveBug = () => setBug({ x: 8 + Math.random() * 80, y: 12 + Math.random() * 72, id: Date.now() })
  const squash = () => {
    if (!playing) return
    const ns = score + 1
    setScore(ns)
    if (ns > best) setBest(ns)
    moveBug()
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#050a16]/80 backdrop-blur p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-white flex items-center gap-2 text-sm"><Bug className="w-4 h-4 text-[#00d4ff]" />Bug Squasher</p>
        <div className="flex gap-3 text-xs font-mono text-slate-400">
          <span>⏱ {time}s</span><span>🏆 {Math.max(best, score)}</span>
        </div>
      </div>
      <div className="relative h-56 rounded-xl bg-black/40 border border-white/5 overflow-hidden cursor-crosshair" onClick={() => playing && setScore((s) => Math.max(0, s))}>
        {playing ? (
          <motion.button
            key={bug.id}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, x: [0, -3, 3, -2, 2, 0], rotate: [0, -8, 8, -5, 5, 0] }}
            transition={{ x: { repeat: Infinity, duration: 0.4 }, rotate: { repeat: Infinity, duration: 0.6 }, scale: { duration: 0.15 } }}
            onClick={(e) => { e.stopPropagation(); squash() }}
            style={{ left: `${bug.x}%`, top: `${bug.y}%` }}
            className="absolute text-3xl select-none"
            aria-label="Bug — click to squash"
          >🐞</motion.button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-4">
            {time === 0 ? (
              <>
                <Trophy className="w-8 h-8 text-amber-400" />
                <p className="text-white font-bold">You squashed {score} bug{score === 1 ? '' : 's'}!</p>
                <p className="text-xs text-slate-400">Every fixed bug makes Gufran&apos;s day easier.</p>
              </>
            ) : (
              <>
                <Bug className="w-8 h-8 text-[#00d4ff]" />
                <p className="text-xs text-slate-400 max-w-52">Squash as many bugs as you can in 20 seconds. Clicking empty space costs nothing… this time.</p>
              </>
            )}
            <Button onClick={start} size="sm" className="brand-gradient-bg text-white">{time === 0 ? <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Play again</> : 'Start game'}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- Typing speed test ---------------- */
const WORDS = ['website', 'client', 'invoice', 'project', 'maintenance', 'dashboard', 'design', 'deploy', 'server', 'database', 'agency', 'riyadh', 'dammam', 'creative', 'code', 'pixel', 'render', 'secure', 'growth', 'support']
function TypingGame() {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle')
  const [round, setRound] = useState(0)
  const [input, setInput] = useState('')
  const [startedAt, setStartedAt] = useState(0)
  const target = useMemo(() => [...WORDS].sort(() => Math.random() - 0.5).slice(0, 8), [round])
  const [wpm, setWpm] = useState(0)

  const onChange = (v: string) => {
    if (phase === 'idle') { setPhase('playing'); setStartedAt(Date.now()) }
    if (phase === 'done') return
    setInput(v)
    if (v.trim() === target.join(' ')) {
      const mins = (Date.now() - startedAt) / 60000
      setWpm(Math.round(target.length / Math.max(mins, 0.01)))
      setPhase('done')
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#050a16]/80 backdrop-blur p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-white flex items-center gap-2 text-sm"><Keyboard className="w-4 h-4 text-[#00d4ff]" />Hacker Typing Test</p>
        {phase === 'done' && <Badge className="brand-gradient-bg text-white border-0">{wpm} WPM</Badge>}
      </div>
      <div className="rounded-xl bg-black/40 border border-white/5 p-4 text-sm font-mono leading-relaxed mb-3">
        {target.map((w, i) => (
          <span key={i} className={
            input.split(' ').length > i
              ? input.split(' ')[i] === w ? 'text-emerald-400' : 'text-rose-400 underline'
              : 'text-slate-500'
          }>{w} </span>
        ))}
      </div>
      {phase === 'done' ? (
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400 flex-1">{wpm >= 40 ? '⚡ Terminal velocity! The CEO dashboard loads slower than you type.' : wpm >= 25 ? '💪 Solid — enough speed to close tickets all day.' : '🌱 Keep training — every developer starts somewhere.'}</p>
          <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => { setPhase('idle'); setInput(''); setRound((r) => r + 1) }}><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Retry</Button>
        </div>
      ) : (
        <input
          value={input}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Start typing the words above…"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-[#0099ff]/60 outline-none font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      )}
    </div>
  )
}

/* ---------------- Main page ---------------- */
export default function CreatorView() {
  const { setView } = useApp()
  const { display, done } = useTypedTerminal(TERMINAL_LINES)
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ container: containerRef })
  const slideX = useTransform(scrollYProgress, [0, 1], [0, -60])

  const skills = [
    { name: 'Next.js / React', value: 92, icon: <Code2 className="w-4 h-4" /> },
    { name: 'UI / UX Design', value: 88, icon: <Zap className="w-4 h-4" /> },
    { name: 'TypeScript', value: 85, icon: <Terminal className="w-4 h-4" /> },
    { name: 'Databases / Prisma', value: 80, icon: <Rocket className="w-4 h-4" /> },
    { name: 'Problem Solving', value: 95, icon: <Heart className="w-4 h-4" /> },
  ]

  return (
    <div ref={containerRef} className="relative rounded-2xl overflow-hidden border border-white/10 -m-3 md:-m-6 min-h-[calc(100vh-8rem)] max-h-[calc(100vh-8rem)] overflow-y-auto ag-scroll bg-[#03060f]">
      <WebGLBackground intensity={1} />

      {/* Back button */}
      <div className="sticky top-0 z-20 flex justify-between items-center p-4 backdrop-blur-sm bg-black/20">
        <Button variant="ghost" size="sm" onClick={() => setView('dashboard')} className="text-slate-300 hover:text-white hover:bg-white/10">
          <ArrowLeft className="w-4 h-4 mr-1.5" />Back to workspace
        </Button>
        <span className="text-[10px] font-mono text-slate-500 tracking-widest">aaliyan.dev // ags-webworks</span>
      </div>

      <motion.div style={{ x: slideX }} className="relative z-10 px-5 md:px-12 pb-24 max-w-5xl mx-auto">
        {/* HERO */}
        <div className="pt-10 md:pt-16 pb-12 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 14 }}
            className="mx-auto w-28 h-28 rounded-3xl brand-gradient-bg flex items-center justify-center text-5xl font-black text-white shadow-xl"
          >
            AA
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 text-4xl md:text-6xl font-black tracking-tight text-white ag-glitch"
          >
            AALIYAN <span className="brand-gradient-text">AAMIR</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-3 text-slate-400 text-sm md:text-base flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5"><GraduationCap className="w-4 h-4 text-[#00d4ff]" />17 · High School Student</span>
            <span className="flex items-center gap-1.5"><Code2 className="w-4 h-4 text-[#00d4ff]" />Full-Stack Developer</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-[#00d4ff]" />Building for AGS WEBWORKS</span>
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-5 flex flex-wrap justify-center gap-2">
            {['Next.js', 'TypeScript', 'Prisma', 'WebGL', 'Tailwind', 'UI/UX', 'shadcn/ui', 'Recharts'].map((t, i) => (
              <motion.span
                key={t}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + i * 0.07 }}
                className="text-[11px] font-mono px-3 py-1 rounded-full border border-[#0099ff]/40 bg-[#0099ff]/10 text-[#7dd3fc]"
              >{t}</motion.span>
            ))}
          </motion.div>
        </div>

        {/* TERMINAL */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur overflow-hidden shadow-2xl"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="ml-3 text-[11px] font-mono text-slate-500">aaliyan@ags-webworks: ~/creator.sh</span>
          </div>
          <div className="p-4 md:p-6 font-mono text-[12px] md:text-sm min-h-72 space-y-1.5">
            <AnimatePresence>
              {display.map((l, i) => (
                <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={
                  l.type === 'cmd' ? 'text-[#00d4ff]' :
                  l.type === 'big' ? 'text-xl md:text-2xl font-black text-white tracking-wide' :
                  l.type === 'ok' ? 'text-emerald-400' : 'text-slate-300'
                }>
                  {l.text}
                  {i === display.length - 1 && !done && <span className="ag-caret text-white">▊</span>}
                </motion.p>
              ))}
            </AnimatePresence>
            {done && <p className="text-[#00d4ff]">agswebworks@core:~$ <span className="ag-caret text-white">▊</span></p>}
          </div>
        </motion.div>

        {/* Scroll hint */}
        <div className="flex justify-center py-8 text-slate-500">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
            <ChevronDown className="w-6 h-6" />
          </motion.div>
        </div>

        {/* ABOUT — sliding cards */}
        <motion.div
          initial={{ opacity: 0, x: 80 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ type: 'spring', stiffness: 60 }}
          className="grid md:grid-cols-3 gap-4"
        >
          {[
            { icon: <Rocket className="w-6 h-6" />, title: 'What I built', text: 'The entire AGS WEBWORKS management system — clients, orders, Kanban, invoices, maintenance subscriptions, recurring billing, reports — a real production app, not a mockup.' },
            { icon: <GraduationCap className="w-6 h-6" />, title: 'Still in school', text: '17 years old, high school. Every line of this system was written between classes, homework and way too much coffee.' },
            { icon: <Coffee className="w-6 h-6" />, title: 'How I think', text: 'Design like an artist, build like an engineer, ship like a founder. If a button exists, it works. If data exists, it persists.' },
          ].map((c, i) => (
            <motion.div
              key={c.title}
              whileHover={{ y: -6, rotate: i === 1 ? 0 : i === 0 ? -1 : 1 }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-5"
            >
              <div className="w-11 h-11 rounded-xl brand-gradient-bg flex items-center justify-center text-white mb-3">{c.icon}</div>
              <h3 className="font-bold text-white text-sm">{c.title}</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{c.text}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* SKILLS */}
        <div className="mt-14">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-2xl md:text-3xl font-black text-white mb-6"
          >
            Skill <span className="brand-gradient-text">matrix</span>
          </motion.h2>
          <div className="space-y-4 max-w-2xl">
            {skills.map((s, i) => (
              <motion.div key={s.name} initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-300 flex items-center gap-2">{s.icon}{s.name}</span>
                  <span className="text-xs font-mono text-[#00d4ff]">{s.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${s.value}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full brand-gradient-bg"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* GAMES */}
        <div className="mt-14">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-2xl md:text-3xl font-black text-white mb-2"
          >
            Take a break — <span className="brand-gradient-text">play something</span>
          </motion.h2>
          <p className="text-xs text-slate-500 mb-6">Because a management system should also have a soul.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <BugSquasher />
            <TypingGame />
          </div>
        </div>

        {/* QUOTE */}
        <motion.blockquote
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <p className="text-xl md:text-3xl font-black text-white leading-snug max-w-3xl mx-auto">
            &ldquo;Age tells you when I started.<br />
            <span className="brand-gradient-text">The software tells you what I can do.&rdquo;</span>
          </p>
          <footer className="mt-4 text-xs text-slate-500 font-mono">— Aaliyan Aamir, creator of this system</footer>
        </motion.blockquote>

        {/* Signature footer */}
        <div className="mt-16 flex flex-col items-center gap-3 pb-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="px-8 py-4 rounded-2xl border border-[#0099ff]/30 bg-[#0099ff]/5"
          >
            <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 mb-1">This entire platform</p>
            <p className="text-lg font-black brand-gradient-text">Made by Aaliyan Aamir</p>
            <p className="text-[10px] text-slate-500 mt-1">17 · High school student · Full-stack developer</p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
