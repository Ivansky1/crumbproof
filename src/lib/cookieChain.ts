import { Buffer } from 'buffer'
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from '@solana/web3.js'
import type { StandardWalletAdapter } from '@solana/wallet-standard'
import { buildProofMemo, parseProofMemo, type ProofPayload } from './proof'

export const COOKIE_RPC = import.meta.env.VITE_COOKIE_RPC ?? 'https://rpc.cookiescan.io'
export const COOKIE_WS = 'wss://wss.cookiescan.io'
export const COOKIE_EXPLORER = 'https://cookiescan.io'
export const COOKIE_BRIDGE = 'https://hyperlane.cookiescan.io'
export const COOKIE_GENESIS = '9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2'
export const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
)

export const connection = new Connection(COOKIE_RPC, {
  commitment: 'confirmed',
  wsEndpoint: COOKIE_WS,
})

export interface NetworkSnapshot {
  slot: number
  blockHeight: number
  transactionCount: number
  genesisHash: string
  healthy: boolean
}

export interface ChainProof extends ProofPayload {
  signature: string
  signer: string
  blockTime: number | null
  slot: number
}

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const [slot, blockHeight, transactionCount, genesisHash] = await Promise.all([
    connection.getSlot('confirmed'),
    connection.getBlockHeight('confirmed'),
    connection.getTransactionCount('confirmed'),
    connection.getGenesisHash(),
  ])

  return {
    slot,
    blockHeight,
    transactionCount,
    genesisHash,
    healthy: genesisHash === COOKIE_GENESIS,
  }
}

export async function requestNightlyCookieNetwork(): Promise<void> {
  const nightly = window.nightly?.solana
  if (!nightly?.changeNetwork) return
  if (nightly.genesisHash === COOKIE_GENESIS) return
  await nightly.changeNetwork({ genesisHash: COOKIE_GENESIS, url: COOKIE_RPC })
}

export async function sendProof(
  adapter: StandardWalletAdapter,
  payload: ProofPayload,
): Promise<string> {
  const signer = adapter.publicKey
  if (!signer) throw new Error('Connect Nightly before baking a proof.')
  const genesisHash = await connection.getGenesisHash()
  if (genesisHash !== COOKIE_GENESIS) {
    throw new Error('Refusing to sign: the configured RPC is not Cookie Chain.')
  }

  const memo = buildProofMemo(payload)
  const latest = await connection.getLatestBlockhash('confirmed')
  const transaction = new Transaction({
    feePayer: signer,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
      data: Buffer.from(memo, 'utf8'),
    }),
  )

  const signature = await adapter.sendTransaction(transaction, connection, {
    preflightCommitment: 'confirmed',
  })
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    'confirmed',
  )
  if (confirmation.value.err) {
    throw new Error(`Cookie Chain rejected the transaction: ${JSON.stringify(confirmation.value.err)}`)
  }
  return signature
}

export async function getProofBySignature(signature: string): Promise<ChainProof | null> {
  const transaction = await connection.getParsedTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  })
  return parseChainProof(signature, transaction)
}

export async function getWalletProofs(owner: PublicKey, limit = 12): Promise<ChainProof[]> {
  const signatures = await connection.getSignaturesForAddress(owner, { limit: Math.min(limit * 4, 50) })
  const transactions = await connection.getParsedTransactions(
    signatures.map(({ signature }) => signature),
    { commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  )
  const proofs = transactions.map((transaction, index) =>
    parseChainProof(signatures[index].signature, transaction),
  )
  return proofs.filter((proof): proof is ChainProof => proof !== null).slice(0, limit)
}

function parseChainProof(
  signature: string,
  transaction: ParsedTransactionWithMeta | null,
): ChainProof | null {
  if (!transaction) return null
  const memo = findCrumbProofMemo(transaction.transaction.message.instructions)
  if (!memo) return null
  const payload = parseProofMemo(memo)
  if (!payload) return null

  const signer = transaction.transaction.message.accountKeys.find((key) => key.signer)
  return {
    ...payload,
    signature,
    signer: signer?.pubkey.toBase58() ?? 'Unknown signer',
    blockTime: transaction.blockTime ?? null,
    slot: transaction.slot,
  }
}

function findCrumbProofMemo(
  instructions: Array<ParsedInstruction | PartiallyDecodedInstruction>,
): string | null {
  for (const instruction of instructions) {
    if (!instruction.programId.equals(MEMO_PROGRAM_ID)) continue
    if ('parsed' in instruction && typeof instruction.parsed === 'string') {
      return instruction.parsed
    }
  }
  return null
}
