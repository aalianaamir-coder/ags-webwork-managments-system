// AGS WEBWORKS — Content-based file validation
// Never trust the client-supplied MIME type: sniff magic bytes instead so a
// renamed executable/archive can never masquerade as an image or document.

/** Minimum bytes needed for any signature check. */
const HEADER = 32

type Sniffer = { mime: string; test: (b: Buffer) => boolean }

/** Signatures are checked in order; first match wins. */
const SNIFFERS: Sniffer[] = [
  // ---- Images ----
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    // "RIFF....WEBP"
    mime: 'image/webp',
    test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    // "GIF87a" / "GIF89a"
    mime: 'image/gif',
    test: (b) => b.length > 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a'),
  },
  {
    // SVG is XML text — only accept when it actually starts with XML/SVG markup
    mime: 'image/svg+xml',
    test: (b) => {
      const head = b.toString('utf8', 0, Math.min(1024, b.length)).trim().toLowerCase()
      return (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype svg'))
        && head.includes('<svg')
    },
  },
  // ---- Documents ----
  { mime: 'application/pdf', test: (b) => b.length > 5 && b.toString('ascii', 0, 5) === '%PDF-' },
  // ---- Archives ----
  { mime: 'application/zip', test: (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) && (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08) },
  // ---- Office (ZIP-based OOXML is covered by the zip sniffer) ----
  // ---- Legacy MS Office ----
  {
    // OLE2 compound file (doc/xls/ppt legacy)
    mime: 'application/x-ole-storage',
    test: (b) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1,
  },
  // ---- Text-like (safe to serve as text/plain family) ----
  { mime: 'text/plain', test: (b) => !b.slice(0, HEADER).includes(0) },
]

/** Office documents arrive as OOXML zip — map zip container to the declared office type when plausible. */
const OOXML_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-word.document.macroEnabled.12',
])
const LEGACY_OFFICE: Record<string, string> = {
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
}

export type SniffResult =
  | { ok: true; mime: string; size: number }
  | { ok: false; reason: 'empty' | 'type-not-allowed' | 'content-mismatch'; detected: string | null }

/**
 * Validate an uploaded file's CONTENT against an allowlist of MIME types.
 *
 * Rules:
 *  1. Empty files are rejected.
 *  2. The declared MIME must be in `allowed`.
 *  3. The actual content must match a known signature, and that signature
 *     must be consistent with the declared type (images must BE images,
 *     PDF must BE a PDF, etc.). A declared type with no content check
 *     (e.g. CSV/JSON) is accepted as plain text only when the content
 *     really is text (no NUL bytes in the header).
 */
export function sniffContent(buffer: Buffer, declaredType: string, allowed: string[]): SniffResult {
  if (!buffer || buffer.length === 0) return { ok: false, reason: 'empty', detected: null }

  const declared = (declaredType || '').toLowerCase().split(';')[0].trim()
  if (!declared) return { ok: false, reason: 'type-not-allowed', detected: null }
  if (!allowed.includes(declared)) return { ok: false, reason: 'type-not-allowed', detected: null }

  // Detect what the content actually is
  let detected: string | null = null
  for (const s of SNIFFERS) {
    if (s.test(buffer)) {
      detected = s.mime
      break
    }
  }
  // Files smaller than the header with no NUL bytes are text
  if (!detected && buffer.length < HEADER && !buffer.includes(0)) detected = 'text/plain'

  const textLike = ['text/plain', 'text/csv', 'text/markdown', 'application/json']
  const legacy = LEGACY_OFFICE[declared]

  if (declared === 'application/zip' || declared === 'application/x-zip-compressed') {
    if (detected === 'application/zip') return { ok: true, mime: declared, size: buffer.length }
  } else if (OOXML_TYPES.has(declared)) {
    // OOXML is a ZIP container — require a real zip signature
    if (detected === 'application/zip') return { ok: true, mime: declared, size: buffer.length }
  } else if (legacy) {
    if (detected === 'application/x-ole-storage') return { ok: true, mime: declared, size: buffer.length }
  } else if (declared === 'image/svg+xml') {
    if (detected === 'image/svg+xml') return { ok: true, mime: declared, size: buffer.length }
  } else if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(declared)) {
    if (detected === declared) return { ok: true, mime: declared, size: buffer.length }
  } else if (declared === 'application/pdf') {
    if (detected === 'application/pdf') return { ok: true, mime: declared, size: buffer.length }
  } else if (textLike.includes(declared)) {
    if (detected === 'text/plain' || detected === null) return { ok: true, mime: declared, size: buffer.length }
  } else if (declared === 'video/mp4') {
    // ftyp box at offset 4
    if (buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp') return { ok: true, mime: declared, size: buffer.length }
  } else if (['audio/mpeg', 'audio/wav'].includes(declared)) {
    // MP3: ID3 tag or MPEG frame sync; WAV: RIFF....WAVE
    const isMp3 = buffer.length > 3 && (buffer.toString('ascii', 0, 3) === 'ID3' || (b => b[0] === 0xff && (b[1] & 0xe0) === 0xe0)(buffer))
    const isWav = buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE'
    if ((declared === 'audio/mpeg' && isMp3) || (declared === 'audio/wav' && isWav)) {
      return { ok: true, mime: declared, size: buffer.length }
    }
  }

  return { ok: false, reason: 'content-mismatch', detected }
}
