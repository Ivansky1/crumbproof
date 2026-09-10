import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { useNightlyWallet } from './hooks/useNightlyWallet'
import {
  COOKIE_BRIDGE,
  COOKIE_EXPLORER,
  getNetworkSnapshot,
  getProofBySignature,
  getWalletProofs,
  sendProof,
  type ChainProof,
  type NetworkSnapshot,
} from './lib/cookieChain'
import {
  formatBytes,
  sha256,
  shortAddress,
  type ProofKind,
  type ProofPayload,
} from './lib/proof'

type WorkState = 'idle' | 'hashing' | 'signing' | 'confirming' | 'success' | 'error'

function App() {
  const wallet = useNightlyWallet()
  const [mode, setMode] = useState<ProofKind>('file')
  const [label, setLabel] = useState('')
  const [textValue, setTextValue] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<ProofPayload | null>(null)
  const [workState, setWorkState] = useState<WorkState>('idle')
  const [message, setMessage] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null)
  const [chainError, setChainError] = useState<string | null>(null)
  const [history, setHistory] = useState<ChainProof[]>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [verifySignature, setVerifySignature] = useState('')
  const [verifiedProof, setVerifiedProof] = useState<ChainProof | null>(null)
  const [verifyFile, setVerifyFile] = useState<File | null>(null)
  const [verifyHash, setVerifyHash] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const refreshNetwork = useCallback(async () => {
    try {
      const next = await getNetworkSnapshot()
      setSnapshot(next)
      setChainError(next.healthy ? null : 'RPC answered from an unexpected chain.')
    } catch (reason) {
      setChainError(toMessage(reason, 'Cookie Chain RPC is not responding.'))
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    if (!wallet.adapter?.publicKey) {
      setHistory([])
      return
    }
    setHistoryBusy(true)
    try {
      setHistory(await getWalletProofs(wallet.adapter.publicKey))
    } catch {
      setHistory([])
    } finally {
      setHistoryBusy(false)
    }
  }, [wallet.adapter])

  useEffect(() => {
    queueMicrotask(refreshNetwork)
    const timer = window.setInterval(refreshNetwork, 30_000)
    return () => window.clearInterval(timer)
  }, [refreshNetwork])

  useEffect(() => {
    queueMicrotask(refreshHistory)
  }, [refreshHistory])

  const clearPreparedProof = () => {
    setDraft(null)
    setReceipt(null)
    setWorkState('idle')
    setMessage('')
  }

  const makePayload = async (): Promise<ProofPayload> => {
    if (mode === 'file') {
      if (!selectedFile) throw new Error('Pick a file first.')
      return {
        hash: await sha256(selectedFile),
        label: label || selectedFile.name,
        kind: 'file',
        size: selectedFile.size,
        mime: selectedFile.type || 'application/octet-stream',
        createdAt: new Date().toISOString(),
      }
    }

    if (!textValue.trim()) throw new Error('Add some text first.')
    return {
      hash: await sha256(textValue),
      label: label || 'Text proof',
      kind: 'text',
      size: new TextEncoder().encode(textValue).byteLength,
      mime: 'text/plain;charset=utf-8',
      createdAt: new Date().toISOString(),
    }
  }

  const prepareProof = async () => {
    setWorkState('hashing')
    setMessage('Hashing locally… nothing is uploaded.')
    try {
      setDraft(await makePayload())
      setWorkState('idle')
      setMessage('Fingerprint ready. Review it before signing.')
    } catch (reason) {
      setWorkState('error')
      setMessage(toMessage(reason, 'Could not hash this proof.'))
    }
  }

  const bakeProof = async () => {
    if (!wallet.adapter) {
      await wallet.connect()
      return
    }
    setReceipt(null)
    setWorkState('hashing')
    setMessage('Re-hashing locally before signing…')
    try {
      const payload = await makePayload()
      setDraft(payload)
      setWorkState('signing')
      setMessage('Review and approve the memo transaction in Nightly.')
      const signature = await sendProof(wallet.adapter, payload)
      setWorkState('confirming')
      setMessage('Transaction sent. Waiting for confirmed finality…')
      setReceipt(signature)
      setWorkState('success')
      setMessage('Proof baked. The receipt is now independently verifiable.')
      await Promise.all([refreshHistory(), refreshNetwork()])
    } catch (reason) {
      setWorkState('error')
      setMessage(toMessage(reason, 'The proof transaction failed.'))
    }
  }

  const verify = async () => {
    const signature = verifySignature.trim()
    if (!signature) {
      setVerifyError('Paste a Cookie Chain transaction signature.')
      return
    }
    setVerifyBusy(true)
    setVerifyError('')
    setVerifiedProof(null)
    setVerifyHash(null)
    try {
      const proof = await getProofBySignature(signature)
      if (!proof) throw new Error('No valid CrumbProof memo was found in this transaction.')
      setVerifiedProof(proof)
      if (verifyFile) setVerifyHash(await sha256(verifyFile))
    } catch (reason) {
      setVerifyError(toMessage(reason, 'Could not verify this receipt.'))
    } finally {
      setVerifyBusy(false)
    }
  }

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(null), 1400)
  }

  const proofMatches = Boolean(verifiedProof && verifyHash && verifiedProof.hash === verifyHash)
  const proofMismatches = Boolean(verifiedProof && verifyHash && verifiedProof.hash !== verifyHash)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CrumbProof home">
          <CookieMark />
          <span>CRUMBPROOF</span>
        </a>
        <div className="top-actions">
          <a className="quiet-link" href={`${COOKIE_EXPLORER}/programs`} target="_blank" rel="noreferrer">
            Explorer <ArrowUpRight />
          </a>
          {wallet.address ? (
            <button className="wallet-button connected" type="button" onClick={wallet.disconnect}>
              <span className="status-dot" /> {shortAddress(wallet.address, 5)}
            </button>
          ) : (
            <button className="wallet-button" type="button" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? 'Connecting…' : 'Connect Nightly'}
            </button>
          )}
        </div>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="eyebrow"><span /> Built on Cookie Chain</div>
          <h1>Proof, baked<br />on-chain.</h1>
          <p className="hero-copy">
            Timestamp any file or text without uploading it. CrumbProof stores only its SHA-256 fingerprint in a cheap, public Cookie Chain receipt.
          </p>
          <div className="network-strip" aria-live="polite">
            <span className={snapshot?.healthy ? 'live-dot' : 'live-dot waiting'} />
            <strong>{snapshot?.healthy ? 'COOKIE CHAIN LIVE' : 'CHECKING NETWORK'}</strong>
            <span className="strip-divider" />
            <span>Slot {snapshot ? snapshot.slot.toLocaleString() : '—'}</span>
            <span className="strip-divider desktop-only" />
            <span className="desktop-only">{snapshot ? snapshot.transactionCount.toLocaleString() : '—'} transactions</span>
          </div>
          {chainError && <p className="inline-error">{chainError}</p>}
        </section>

        <section className="workspace-grid" aria-label="Create an on-chain proof">
          <div className="proof-card">
            <div className="card-heading">
              <div>
                <span className="step-number">01</span>
                <h2>Create a proof</h2>
              </div>
              <span className="local-badge"><LockIcon /> Local hashing</span>
            </div>

            <div className="segmented" aria-label="Proof source">
              <button type="button" className={mode === 'file' ? 'active' : ''} onClick={() => { setMode('file'); clearPreparedProof() }}>
                <FileIcon /> File
              </button>
              <button type="button" className={mode === 'text' ? 'active' : ''} onClick={() => { setMode('text'); clearPreparedProof() }}>
                <TextIcon /> Text
              </button>
            </div>

            {mode === 'file' ? (
              <label className={`dropzone ${selectedFile ? 'has-file' : ''}`} htmlFor="proof-file">
                <input
                  id="proof-file"
                  name="proof-file"
                  type="file"
                  onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); clearPreparedProof() }}
                />
                <span className="drop-icon">{selectedFile ? <CheckIcon /> : <UploadIcon />}</span>
                {selectedFile ? (
                  <>
                    <strong>{selectedFile.name}</strong>
                    <small>{formatBytes(selectedFile.size)} · click to replace</small>
                  </>
                ) : (
                  <>
                    <strong>Choose a file</strong>
                    <small>The file stays on this device</small>
                  </>
                )}
              </label>
            ) : (
              <label className="field text-field">
                <span>Text to fingerprint</span>
                <textarea
                  id="proof-text"
                  name="proof-text"
                  value={textValue}
                  onChange={(event) => { setTextValue(event.target.value); clearPreparedProof() }}
                  rows={7}
                  maxLength={10_000}
                  placeholder="Paste an agreement, statement, release note…"
                />
                <small>{textValue.length.toLocaleString()} / 10,000 characters</small>
              </label>
            )}

            <label className="field">
              <span>Public label <em>optional</em></span>
              <input
                id="proof-label"
                name="proof-label"
                value={label}
                onChange={(event) => { setLabel(event.target.value); clearPreparedProof() }}
                maxLength={80}
                placeholder={mode === 'file' ? selectedFile?.name || 'e.g. Partnership agreement' : 'e.g. Release statement'}
              />
              <small>Labels and file metadata are public. The content is not.</small>
            </label>

            {draft && (
              <div className="fingerprint-panel">
                <div>
                  <span>SHA-256 fingerprint</span>
                  <button type="button" onClick={() => copy(draft.hash, 'draft')} aria-label="Copy fingerprint">
                    {copied === 'draft' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code>{draft.hash}</code>
              </div>
            )}

            <div className="proof-actions">
              <button className="secondary-button" type="button" onClick={prepareProof} disabled={workState === 'hashing'}>
                Preview fingerprint
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={bakeProof}
                disabled={['hashing', 'signing', 'confirming'].includes(workState)}
              >
                {wallet.adapter ? 'Bake proof on-chain' : 'Connect Nightly to bake'} <ArrowRight />
              </button>
            </div>

            {(message || wallet.error) && (
              <div className={`notice ${workState === 'error' || wallet.error ? 'error' : workState === 'success' ? 'success' : ''}`} role="status">
                {workState === 'success' ? <CheckIcon /> : <PulseIcon />}
                <span>{wallet.error || message}</span>
              </div>
            )}

            {receipt && (
              <div className="receipt">
                <div className="receipt-top"><span>Confirmed receipt</span><span className="receipt-stamp">BAKED</span></div>
                <button type="button" onClick={() => copy(receipt, 'receipt')}>
                  <code>{shortAddress(receipt, 14)}</code>
                  <span>{copied === 'receipt' ? 'Copied' : 'Copy'}</span>
                </button>
                <a href={`${COOKIE_EXPLORER}/tx/${receipt}`} target="_blank" rel="noreferrer">
                  View on CookieScan <ArrowUpRight />
                </a>
              </div>
            )}
          </div>

          <aside className="side-stack">
            <div className="side-card how-card">
              <span className="step-number">HOW IT WORKS</span>
              <ol>
                <li><span>1</span><div><strong>Fingerprint</strong><p>SHA-256 is calculated in your browser.</p></div></li>
                <li><span>2</span><div><strong>Sign</strong><p>Nightly shows the exact transaction.</p></div></li>
                <li><span>3</span><div><strong>Verify</strong><p>The public receipt proves content and time.</p></div></li>
              </ol>
            </div>
            <div className="side-card privacy-card">
              <ShieldIcon />
              <div><strong>Zero-upload by design</strong><p>Your file never touches a server. Only the hash, label, type, size and timestamp become public.</p></div>
            </div>
            <a className="bridge-card" href={COOKIE_BRIDGE} target="_blank" rel="noreferrer">
              <div><span>Need fee tokens?</span><strong>Bridge COOK</strong></div><ArrowUpRight />
            </a>
          </aside>
        </section>

        <section className="verify-section">
          <div className="section-intro">
            <span className="step-number">02</span>
            <h2>Verify a receipt</h2>
            <p>Paste a transaction signature. Add the original file for an instant integrity match.</p>
          </div>
          <div className="verify-card">
            <label className="field signature-field">
              <span>Cookie Chain transaction signature</span>
              <div>
                <input id="verify-signature" name="verify-signature" value={verifySignature} onChange={(event) => setVerifySignature(event.target.value)} placeholder="Paste signature…" />
                <button className="primary-button compact" type="button" onClick={verify} disabled={verifyBusy}>
                  {verifyBusy ? 'Checking…' : 'Verify'} <ArrowRight />
                </button>
              </div>
            </label>
            <label className="verify-file">
              <input id="verify-file" name="verify-file" type="file" onChange={(event) => setVerifyFile(event.target.files?.[0] ?? null)} />
              <FileIcon /> <span>{verifyFile ? verifyFile.name : 'Add original file (optional)'}</span>
            </label>
            {verifyError && <p className="inline-error">{verifyError}</p>}
            {verifiedProof && (
              <div className="verified-result">
                <div className="verified-title"><CheckIcon /><div><strong>Valid CrumbProof receipt</strong><span>Confirmed at slot {verifiedProof.slot.toLocaleString()}</span></div></div>
                <dl>
                  <div><dt>Label</dt><dd>{verifiedProof.label}</dd></div>
                  <div><dt>Signer</dt><dd>{shortAddress(verifiedProof.signer, 8)}</dd></div>
                  <div><dt>Chain time</dt><dd>{new Date((verifiedProof.blockTime ?? Date.parse(verifiedProof.createdAt) / 1000) * 1000).toLocaleString()}</dd></div>
                  <div><dt>Fingerprint</dt><dd><code>{shortAddress(verifiedProof.hash, 12)}</code></dd></div>
                </dl>
                {verifyHash && <div className={`match-banner ${proofMatches ? 'match' : 'mismatch'}`}>{proofMatches ? <><CheckIcon /> File fingerprint matches perfectly.</> : proofMismatches ? <>Fingerprint mismatch. This is not the original file.</> : null}</div>}
              </div>
            )}
          </div>
        </section>

        <section className="history-section">
          <div className="section-row">
            <div><span className="step-number">03</span><h2>Your crumb trail</h2></div>
            {wallet.address && <button className="refresh-button" type="button" onClick={refreshHistory} disabled={historyBusy}>{historyBusy ? 'Refreshing…' : 'Refresh'}</button>}
          </div>
          {!wallet.address ? (
            <div className="empty-state"><CookieMark /><strong>Connect Nightly to load your receipts</strong><p>History comes straight from Cookie Chain RPC.</p></div>
          ) : history.length === 0 ? (
            <div className="empty-state"><CookieMark /><strong>No CrumbProof receipts yet</strong><p>Your first baked proof will appear here.</p></div>
          ) : (
            <div className="history-list">
              {history.map((proof) => (
                <a key={proof.signature} href={`${COOKIE_EXPLORER}/tx/${proof.signature}`} target="_blank" rel="noreferrer">
                  <span className="history-icon"><FileIcon /></span>
                  <div><strong>{proof.label}</strong><p>{formatBytes(proof.size)} · {new Date(proof.createdAt).toLocaleDateString()}</p></div>
                  <code>{shortAddress(proof.hash, 7)}</code><ArrowUpRight />
                </a>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer>
        <div className="brand"><CookieMark /><span>CRUMBPROOF</span></div>
        <p>Open proof infrastructure for Cookie Chain.</p>
        <div><a href="https://docs.cookiechain.wtf" target="_blank" rel="noreferrer">Docs</a><a href={COOKIE_EXPLORER} target="_blank" rel="noreferrer">CookieScan</a></div>
      </footer>
    </div>
  )
}

function toMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

function CookieMark() {
  return <svg viewBox="0 0 36 36" aria-hidden="true"><path d="M29.7 14.2a6.2 6.2 0 0 1-7.9-7.9A13 13 0 1 0 29.7 14.2Z" fill="currentColor"/><circle cx="10.5" cy="16" r="1.8" fill="#19130e"/><circle cx="18.3" cy="23.5" r="1.7" fill="#19130e"/><circle cx="9.5" cy="25.5" r="1.2" fill="#19130e"/><circle cx="19.5" cy="14.2" r="1.25" fill="#19130e"/></svg>
}
function ArrowRight() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" /></svg> }
function ArrowUpRight() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 14 14 6m-7 0h7v7" /></svg> }
function FileIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h5" /></svg> }
function TextIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M12 5v14M8 19h8" /></svg> }
function LockIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2"/><path d="M7 8V6a3 3 0 0 1 6 0v2" /></svg> }
function UploadIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-5 5 5-5 5 5M5 20h14" /></svg> }
function CheckIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-9" /></svg> }
function PulseIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h4l2-5 4 10 2-5h4" /></svg> }
function ShieldIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6zM8 12l2.5 2.5L16 9" /></svg> }

export default App
