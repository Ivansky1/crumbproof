import { useCallback, useEffect, useState } from 'react'
import {
  isWalletAdapterCompatibleStandardWallet,
  type WalletAdapterCompatibleStandardWallet,
} from '@solana/wallet-adapter-base'
import { StandardWalletAdapter } from '@solana/wallet-standard'
import { getWallets } from '@wallet-standard/core'
import { requestNightlyCookieNetwork } from '../lib/cookieChain'

export function useNightlyWallet() {
  const [adapter, setAdapter] = useState<StandardWalletAdapter | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, render] = useState(0)

  const discover = useCallback((): WalletAdapterCompatibleStandardWallet | null => {
    const wallet = getWallets()
      .get()
      .filter(isWalletAdapterCompatibleStandardWallet)
      .find((candidate) => candidate.name.toLowerCase().includes('nightly'))
    return wallet ?? null
  }, [])

  const available = Boolean(discover() || window.nightly?.solana)

  useEffect(() => {
    const registry = getWallets()
    const onRegistryChange = () => render((value) => value + 1)
    const unregister = registry.on('register', onRegistryChange)
    const unregistered = registry.on('unregister', onRegistryChange)
    return () => {
      unregister()
      unregistered()
    }
  }, [discover])

  useEffect(() => {
    if (!adapter) return
    const onChange = () => render((value) => value + 1)
    const onError = (walletError: Error) => setError(walletError.message)
    adapter.on('connect', onChange)
    adapter.on('disconnect', onChange)
    adapter.on('error', onError)
    return () => {
      adapter.off('connect', onChange)
      adapter.off('disconnect', onChange)
      adapter.off('error', onError)
    }
  }, [adapter])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      await requestNightlyCookieNetwork()
      const wallet = discover()
      if (!wallet) {
        throw new Error('Nightly was not detected. Install or unlock the Nightly browser extension.')
      }
      const nextAdapter = new StandardWalletAdapter({ wallet })
      await nextAdapter.connect()
      setAdapter(nextAdapter)
    } catch (reason) {
      setError(toMessage(reason))
    } finally {
      setConnecting(false)
    }
  }, [discover])

  const disconnect = useCallback(async () => {
    if (!adapter) return
    setError(null)
    try {
      await adapter.disconnect()
      setAdapter(null)
    } catch (reason) {
      setError(toMessage(reason))
    }
  }, [adapter])

  return {
    adapter,
    address: adapter?.publicKey?.toBase58() ?? null,
    available,
    connecting,
    error,
    connect,
    disconnect,
  }
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Nightly could not connect.'
}
