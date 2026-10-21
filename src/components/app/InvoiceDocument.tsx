'use client'

// AGS WEBWORKS — printable / downloadable invoice document.
// Uses inline styles with hex colors ONLY (html2canvas cannot parse Tailwind 4
// oklch colors), so the PDF looks exactly like the on-screen document.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Printer, Loader2 } from 'lucide-react'

export type InvoiceDoc = {
  kind: 'project' | 'maintenance'
  invoiceCode: string
  issueDate: string
  dueDate: string
  status: string
  // client
  clientName: string
  clientContact?: string | null
  clientPhone?: string | null
  clientEmail?: string | null
  clientLocation?: string | null
  // lines
  items: { description: string; quantity: number; unitPrice: number; amount: number }[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  amountPaid: number
  notes?: string | null
  terms?: string | null
  paymentInstructions?: string | null
  // extras for maintenance
  domain?: string | null
  packageName?: string | null
  billingPeriod?: string | null
  // who prepared it
  preparedBy?: { name: string; role: string; avatarUrl?: string | null } | null
  settings?: {
    companyName: string
    tagline?: string
    email?: string | null
    phone?: string | null
    website?: string
    address?: string | null
    city?: string
    country?: string
    crNumber?: string | null
    vatNumber?: string | null
    vatEnabled?: boolean
    paymentInstructions?: string | null
  } | null
}

const S = {
  page: { background: '#ffffff', color: '#111827', fontFamily: 'Arial, Helvetica, sans-serif', width: '794px', margin: '0 auto', position: 'relative' as const, overflow: 'hidden' },
  header: { background: '#111a2e', padding: '28px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { color: '#ffffff' },
  brandName: { fontSize: '26px', fontWeight: 800, letterSpacing: '0.5px', margin: 0 },
  brandSub: { fontSize: '10px', letterSpacing: '4px', opacity: 0.7, margin: '4px 0 0' },
  invoiceTitle: { fontSize: '30px', fontWeight: 800, color: '#ffffff', margin: 0, textAlign: 'right' as const },
  invoiceMeta: { fontSize: '11px', color: '#ffffff', opacity: 0.75, textAlign: 'right' as const, marginTop: '6px' },
  body: { padding: '30px 36px' },
  parties: { display: 'flex', justifyContent: 'space-between', gap: '24px', marginBottom: '26px' },
  partyLabel: { fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#1e40af', fontWeight: 700, marginBottom: '8px' },
  partyText: { fontSize: '12px', lineHeight: '1.7', color: '#374151', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '24px' },
  th: { background: '#111a2e', color: '#ffffff', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' as const, padding: '10px 14px', textAlign: 'left' as const },
  td: { fontSize: '12px', color: '#1f2937', padding: '11px 14px', borderBottom: '1px solid #e5e7eb' },
  totalsWrap: { display: 'flex', justifyContent: 'flex-end', marginBottom: '26px' },
  totals: { width: '300px' },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: '12.5px', color: '#374151' },
  grand: { display: 'flex', justifyContent: 'space-between', padding: '12px 14px', fontSize: '16px', fontWeight: 800, color: '#ffffff', background: '#1e40af', borderRadius: '8px', marginTop: '6px' },
  statusPaid: { display: 'inline-block', padding: '6px 16px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, letterSpacing: '1px' },
  box: { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px' },
  boxTitle: { fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#1e40af', fontWeight: 700, marginBottom: '6px' },
  boxText: { fontSize: '11.5px', color: '#374151', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' as const },
  footer: { borderTop: '1px solid #e5e7eb', padding: '16px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' },
  footerText: { fontSize: '10px', color: '#6b7280' },
  prepared: { display: 'flex', alignItems: 'center', gap: '10px' },
  preparedImg: { width: '42px', height: '42px', borderRadius: '50%', border: '2px solid #1e40af', objectFit: 'cover' as const },
  preparedName: { fontSize: '12px', fontWeight: 700, color: '#111827', margin: 0 },
  preparedRole: { fontSize: '10px', color: '#6b7280', margin: '2px 0 0' },
  madeBy: { textAlign: 'center' as const, fontSize: '10px', color: '#6b7280', padding: '10px 0 14px', background: '#f8fafc' },
}

function statusColors(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'Paid': return { bg: '#d1fae5', fg: '#065f46', label: 'PAID' }
    case 'Partially Paid': return { bg: '#fef3c7', fg: '#92400e', label: 'PARTIALLY PAID' }
    case 'Overdue': return { bg: '#fee2e2', fg: '#991b1b', label: 'OVERDUE' }
    case 'Void': return { bg: '#e5e7eb', fg: '#374151', label: 'VOID' }
    case 'Draft': return { bg: '#e5e7eb', fg: '#374151', label: 'DRAFT' }
    default: return { bg: '#dbeafe', fg: '#1e40af', label: 'ISSUED' }
  }
}

export function InvoiceDocument({ doc }: { doc: InvoiceDoc }) {
  const st = statusColors(doc.status)
  const s = doc.settings
  const fmt = (n: number) => `SAR ${n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const balance = doc.total - doc.amountPaid

  return (
    <div id="invoice-print-area" style={S.page} className="print-area shadow-xl rounded-xl">
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          { }
          <img src="/logo-256.png" alt="AGS WEBWORKS" style={{ width: '64px', height: '64px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)' }} />
          <div style={S.headerText}>
            <p style={S.brandName}>AGS <span style={{ color: '#a5f3fc' }}>WEBWORKS</span></p>
            <p style={S.brandSub}>{s?.tagline ?? 'YOUR WEBSITE • OUR EXPERTISE'}</p>
            <p style={{ fontSize: 10, opacity: 0.85, margin: '6px 0 0' }}>
              {s?.website ?? 'https://agswebworks.com'}{s?.email ? ` · ${s.email}` : ''}
            </p>
          </div>
        </div>
        <div>
          <p style={S.invoiceTitle}>INVOICE</p>
          <div style={S.invoiceMeta}>
            <p style={{ margin: 0 }}><b>{doc.invoiceCode}</b></p>
            <p style={{ margin: '3px 0 0' }}>Issued: {new Date(doc.issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            <p style={{ margin: '3px 0 0' }}>Due: {new Date(doc.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Parties */}
      <div style={S.body}>
        <div style={S.parties}>
          <div>
            <p style={S.partyLabel}>From — AGS WEBWORKS</p>
            <p style={S.partyText}>
              AGS WEBWORKS<br />
              {[s?.address, s?.city, s?.country].filter(Boolean).join(', ') || 'Dammam, Saudi Arabia'}<br />
              {s?.phone ?? ''}{s?.phone && s?.email ? ' · ' : ''}{s?.email ?? ''}<br />
              {s?.crNumber ? `CR: ${s.crNumber}` : ''}{s?.vatNumber ? ` · VAT: ${s.vatNumber}` : ''}
            </p>
          </div>
          <div>
            <p style={S.partyLabel}>Bill To</p>
            <p style={S.partyText}>
              <b style={{ fontSize: 13 }}>{doc.clientName}</b><br />
              {doc.clientContact ?? ''}{doc.clientContact ? <br /> : null}
              {doc.clientPhone ?? ''}{doc.clientPhone ? <br /> : null}
              {doc.clientEmail ?? ''}{doc.clientEmail ? <br /> : null}
              {doc.clientLocation ?? ''}
            </p>
          </div>
          <div>
            <p style={S.partyLabel}>Payment Status</p>
            <span style={{ ...S.statusPaid, background: st.bg, color: st.fg }}>{st.label}</span>
            {doc.kind === 'maintenance' && (
              <p style={{ ...S.partyText, marginTop: 10 }}>
                Package: <b>{doc.packageName}</b><br />
                {doc.domain ? <>Domain: <b>{doc.domain}</b><br /></> : null}
                {doc.billingPeriod ? <>Period: <b>{doc.billingPeriod}</b></> : null}
              </p>
            )}
          </div>
        </div>

        {/* Items */}
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>#</th>
              <th style={S.th}>Description</th>
              <th style={{ ...S.th, textAlign: 'center' }}>Qty</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Unit Price</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, i) => (
              <tr key={i}>
                <td style={{ ...S.td, color: '#9ca3af' }}>{i + 1}</td>
                <td style={S.td}>{it.description}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{it.quantity}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>{fmt(it.unitPrice)}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmt(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={S.totalsWrap}>
          <div style={S.totals}>
            <div style={S.totalRow}><span>Subtotal</span><span>{fmt(doc.subtotal)}</span></div>
            {doc.taxRate > 0 && <div style={S.totalRow}><span>VAT ({doc.taxRate}%)</span><span>{fmt(doc.taxAmount)}</span></div>}
            {doc.amountPaid > 0 && <div style={{ ...S.totalRow, color: '#059669' }}><span>Amount Paid</span><span>− {fmt(doc.amountPaid)}</span></div>}
            {doc.amountPaid > 0 && <div style={{ ...S.totalRow, fontWeight: 700 }}><span>Balance Due</span><span>{fmt(balance)}</span></div>}
            <div style={S.grand}><span>Total {doc.amountPaid > 0 && doc.amountPaid < doc.total ? 'Amount' : ''}</span><span>{fmt(doc.total)}</span></div>
          </div>
        </div>

        {/* Notes & payment info */}
        {(doc.paymentInstructions || s?.paymentInstructions) && (
          <div style={S.box}>
            <p style={S.boxTitle}>Payment Instructions</p>
            <p style={S.boxText}>{doc.paymentInstructions ?? s?.paymentInstructions}</p>
          </div>
        )}
        {doc.notes && (
          <div style={S.box}>
            <p style={S.boxTitle}>Notes</p>
            <p style={S.boxText}>{doc.notes}</p>
          </div>
        )}
        {doc.terms && (
          <div style={S.box}>
            <p style={S.boxTitle}>Terms</p>
            <p style={S.boxText}>{doc.terms}</p>
          </div>
        )}
      </div>

      {/* Footer with team member avatar */}
      <div style={S.footer}>
        <div style={S.prepared}>
          {doc.preparedBy?.avatarUrl ? (
             
            <img src={doc.preparedBy.avatarUrl} alt={doc.preparedBy.name} style={S.preparedImg} />
          ) : (
            <div style={{ ...S.preparedImg, background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>
              {(doc.preparedBy?.name ?? 'AG').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p style={S.preparedName}>{doc.preparedBy?.name ?? 'AGS WEBWORKS'}</p>
            <p style={S.preparedRole}>{doc.preparedBy?.role ?? 'Web Development & Digital Services'}</p>
          </div>
        </div>
        <p style={S.footerText}>Thank you for your business — AGS WEBWORKS · Dammam &amp; Al Khobar, KSA</p>
      </div>
      <p style={S.madeBy}>Made by Aaliyan Aamir</p>
    </div>
  )
}

/** Toolbar: download PDF (html2canvas + jsPDF) and print. */
export function InvoiceActions({ doc }: { doc: InvoiceDoc }) {
  const [busy, setBusy] = useState(false)

  const downloadPdf = async () => {
    setBusy(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
      const el = document.getElementById('invoice-print-area')
      if (!el) return
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW - 0
      const imgH = (canvas.height * imgW) / canvas.width
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgW, imgH)
      if (imgH > pageH) {
        // multi-page support
        let remaining = imgH - pageH
        let position = -pageH
        while (remaining > 0) {
          pdf.addPage()
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgW, imgH)
          position -= pageH
          remaining -= pageH
        }
      }
      pdf.save(`${doc.invoiceCode}.pdf`)
    } catch (err) {
      console.error(err)
      alert('PDF export failed — you can still use the Print button and choose "Save as PDF".')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2 no-print mb-4">
      <Button onClick={downloadPdf} disabled={busy} className="brand-gradient-bg text-white">
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Download className="w-4 h-4 mr-1.5" />}
        Download PDF
      </Button>
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="w-4 h-4 mr-1.5" /> Print
      </Button>
    </div>
  )
}
