interface NightlySolanaProvider {
  genesisHash?: string
  standardWallet?: unknown
  changeNetwork?: (network: { genesisHash: string; url: string }) => Promise<void>
}

interface Window {
  nightly?: {
    solana?: NightlySolanaProvider
  }
}
