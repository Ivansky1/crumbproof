interface NightlySolanaProvider {
  genesisHash?: string
  changeNetwork?: (network: { genesisHash: string; url: string }) => Promise<void>
}

interface Window {
  nightly?: {
    solana?: NightlySolanaProvider
  }
}
