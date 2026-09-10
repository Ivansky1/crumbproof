import { describe, expect, it } from 'vitest'
import { buildProofMemo, parseProofMemo, sha256 } from './proof'

const HASH = 'a'.repeat(64)

describe('proof protocol', () => {
  it('hashes text with SHA-256', async () => {
    await expect(sha256('crumbproof')).resolves.toBe(
      'bb2f7d248eff0c8dda47decf5f2d4d1be121add3282aef045d7f3bc2acaa312b',
    )
  })

  it('round-trips a compact memo payload', () => {
    const memo = buildProofMemo({
      hash: HASH,
      label: '  Signed   contract  ',
      kind: 'file',
      size: 2048,
      mime: 'application/pdf',
      createdAt: '2026-09-10T12:00:00.000Z',
    })

    expect(parseProofMemo(memo)).toEqual({
      hash: HASH,
      label: 'Signed contract',
      kind: 'file',
      size: 2048,
      mime: 'application/pdf',
      createdAt: '2026-09-10T12:00:00.000Z',
    })
  })

  it('rejects malformed or unrelated memos', () => {
    expect(parseProofMemo('hello')).toBeNull()
    expect(parseProofMemo('crumbproof:v1:{"h":"nope"}')).toBeNull()
    expect(() =>
      buildProofMemo({
        hash: 'nope',
        label: 'bad',
        kind: 'text',
        size: 3,
        mime: 'text/plain',
        createdAt: new Date().toISOString(),
      }),
    ).toThrow(/SHA-256/)
  })
})
