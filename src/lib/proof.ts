export const PROOF_PREFIX = 'crumbproof:v1:'

export type ProofKind = 'text' | 'file'

export interface ProofPayload {
  hash: string
  label: string
  kind: ProofKind
  size: number
  mime: string
  createdAt: string
}

interface CompactProofPayload {
  h: string
  l: string
  k: ProofKind
  s: number
  m: string
  t: string
}

const HEX_256 = /^[a-f0-9]{64}$/

export async function sha256(input: Blob | string): Promise<string> {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : new Uint8Array(await input.arrayBuffer())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function buildProofMemo(payload: ProofPayload): string {
  if (!HEX_256.test(payload.hash)) {
    throw new Error('Proof hash must be a lowercase SHA-256 digest.')
  }

  const compact: CompactProofPayload = {
    h: payload.hash,
    l: clean(payload.label, 80) || 'Untitled proof',
    k: payload.kind,
    s: Number.isSafeInteger(payload.size) && payload.size >= 0 ? payload.size : 0,
    m: clean(payload.mime, 64),
    t: new Date(payload.createdAt).toISOString(),
  }

  const memo = `${PROOF_PREFIX}${JSON.stringify(compact)}`
  if (new TextEncoder().encode(memo).byteLength > 500) {
    throw new Error('Proof metadata is too large for an on-chain memo.')
  }
  return memo
}

export function parseProofMemo(memo: string): ProofPayload | null {
  if (!memo.startsWith(PROOF_PREFIX)) return null

  try {
    const value = JSON.parse(memo.slice(PROOF_PREFIX.length)) as Partial<CompactProofPayload>
    if (
      typeof value.h !== 'string' ||
      !HEX_256.test(value.h) ||
      typeof value.l !== 'string' ||
      (value.k !== 'text' && value.k !== 'file') ||
      typeof value.s !== 'number' ||
      !Number.isSafeInteger(value.s) ||
      value.s < 0 ||
      typeof value.m !== 'string' ||
      typeof value.t !== 'string' ||
      Number.isNaN(Date.parse(value.t))
    ) {
      return null
    }

    return {
      hash: value.h,
      label: value.l,
      kind: value.k,
      size: value.s,
      mime: value.m,
      createdAt: new Date(value.t).toISOString(),
    }
  } catch {
    return null
  }
}

export function shortAddress(value: string, edge = 4): string {
  if (value.length <= edge * 2 + 1) return value
  return `${value.slice(0, edge)}…${value.slice(-edge)}`
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function clean(value: string, maxLength: number): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
