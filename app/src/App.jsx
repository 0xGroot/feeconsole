import { useState } from 'react'
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatUnits,
  isAddress,
  parseUnits,
} from 'ethers'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { base } from 'wagmi/chains'
import { RPC_URL } from './wagmi.js'

const V2_MANAGER = '0x44a8630bA264c94063491658763c44f61bBA1ac2'
const CL_MANAGER = '0x277662C00cC2bBBFC98A35a771b2f7352a7a25fC'
const MAX_UINT24 = 16777215n
const FEE_ABI = [
  'function updateSvammFeesOf(address[] _svammPools, uint256[] _feeths) external',
  'function getSvammPools(address[] _pools) external view returns (uint256[])',
  'function updateFeesOf(address[] _pools, uint24[] _bps) external',
  'function getPools(address[] _pools) external view returns (uint256[])',
]

const readProvider = new JsonRpcProvider(RPC_URL)

function normalizeFeeInput(value) {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d*\.?\d+$/.test(normalized)) {
    throw Error('Enter a valid fee percentage (example: 0.3 for 0.30%).')
  }
  return normalized
}

function feeToRaw(value, decimals) {
  return parseUnits(normalizeFeeInput(value), decimals)
}

function rawToFee(value, decimals) {
  const formatted = formatUnits(value, decimals)
  return `${formatted.includes('.') ? formatted.replace(/\.?0+$/, '') : formatted}%`
}

function formatError(error, fallback) {
  return error ? error.shortMessage ?? error.reason ?? error.message ?? fallback : fallback
}

function connectorLabel(connector) {
  if (connector.id === 'walletConnect') return 'WalletConnect'
  if (connector.id === 'injected') return 'Browser Wallet'
  return connector.name
}

export default function App() {
  const [status, setStatus] = useState('')
  const { address, isConnected, chainId, connector } = useAccount()
  const { connectAsync, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const [pendingConnectorId, setPendingConnectorId] = useState(null)
  const busy = isConnecting || isSwitching

  const [v2Pool, setV2Pool] = useState('')
  const [v2Fee, setV2Fee] = useState('')
  const [v2Status, setV2Status] = useState('')
  const [v2Result, setV2Result] = useState('')
  const [v2Busy, setV2Busy] = useState(false)

  const [clPool, setClPool] = useState('')
  const [clFee, setClFee] = useState('')
  const [clStatus, setClStatus] = useState('')
  const [clResult, setClResult] = useState('')
  const [clBusy, setClBusy] = useState(false)

  async function connectWallet(selectedConnector) {
    setStatus('')
    const next = selectedConnector ?? connectors.find((item) => item.id === 'injected') ?? connectors[0]
    setPendingConnectorId(next?.id ?? null)
    try {
      if (!next) throw Error('No wallet connector available.')
      const result = await connectAsync({ connector: next })
      if (result.chainId !== base.id) await switchChainAsync({ chainId: base.id })
      setStatus('Wallet connected on Base.')
    } catch (error) {
      setStatus(formatError(error, 'Could not connect wallet.'))
    } finally {
      setPendingConnectorId(null)
    }
  }

  function disconnectWallet() {
    disconnect()
    setStatus('Wallet disconnected.')
  }

  async function getSigner() {
    if (!isConnected) throw Error('Connect wallet first.')
    if (!connector) throw Error('No wallet connector available.')
    if (chainId !== base.id) await switchChainAsync({ chainId: base.id })
    const provider = await connector.getProvider()
    if (!provider) throw Error('Wallet provider is unavailable.')
    return new BrowserProvider(provider, base.id).getSigner()
  }

  async function readV2Fee() {
    setV2Busy(true)
    setV2Status('')
    setV2Result('')
    try {
      if (!isAddress(v2Pool.trim())) throw Error('Enter a valid V2 pool contract address.')
      const [raw] = await new Contract(V2_MANAGER, FEE_ABI, readProvider).getSvammPools([v2Pool.trim()])
      setV2Result(`${rawToFee(raw, 16)} (raw: ${raw.toString()})`)
      setV2Status('Fee read successfully.')
    } catch (error) {
      setV2Status(formatError(error, 'Failed to read V2 fee.'))
    } finally {
      setV2Busy(false)
    }
  }

  async function updateV2Fee() {
    setV2Busy(true)
    setV2Status('')
    try {
      if (!isAddress(v2Pool.trim())) throw Error('Enter a valid V2 pool contract address.')
      const raw = feeToRaw(v2Fee, 16)
      const tx = await new Contract(V2_MANAGER, FEE_ABI, await getSigner()).updateSvammFeesOf(
        [v2Pool.trim()],
        [raw],
      )
      setV2Status(`Transaction sent: ${tx.hash}. Raw payload fee: ${raw.toString()}. Waiting for confirmation...`)
      await tx.wait()
      setV2Status(`Updated V2 fee to ${rawToFee(raw, 16)} (raw: ${raw.toString()}).`)
      setV2Result(`${rawToFee(raw, 16)} (raw: ${raw.toString()})`)
    } catch (error) {
      setV2Status(formatError(error, 'Failed to update V2 fee.'))
    } finally {
      setV2Busy(false)
    }
  }

  async function readClFee() {
    setClBusy(true)
    setClStatus('')
    setClResult('')
    try {
      if (!isAddress(clPool.trim())) throw Error('Enter a valid 2THICK CL pool contract address.')
      const [raw] = await new Contract(CL_MANAGER, FEE_ABI, readProvider).getPools([clPool.trim()])
      setClResult(`${rawToFee(raw, 4)} (raw: ${raw.toString()})`)
      setClStatus('Fee read successfully.')
    } catch (error) {
      setClStatus(formatError(error, 'Failed to read 2THICK CL fee.'))
    } finally {
      setClBusy(false)
    }
  }

  async function updateClFee() {
    setClBusy(true)
    setClStatus('')
    try {
      if (!isAddress(clPool.trim())) throw Error('Enter a valid 2THICK CL pool contract address.')
      const raw = feeToRaw(clFee, 4)
      if (raw > MAX_UINT24) throw Error('2THICK fee is too large (must fit uint24).')
      const tx = await new Contract(CL_MANAGER, FEE_ABI, await getSigner()).updateFeesOf(
        [clPool.trim()],
        [raw],
      )
      setClStatus(`Transaction sent: ${tx.hash}. Raw payload fee: ${raw.toString()}. Waiting for confirmation...`)
      await tx.wait()
      setClStatus(`Updated 2THICK fee to ${rawToFee(raw, 4)} (raw: ${raw.toString()}).`)
      setClResult(`${rawToFee(raw, 4)} (raw: ${raw.toString()})`)
    } catch (error) {
      setClStatus(formatError(error, 'Failed to update 2THICK CL fee.'))
    } finally {
      setClBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">scale.farm fee management</p>
          <h1>Fee Console</h1>
        </div>
        <div className="wallet-box">
          <div className="wallet-actions">
            {isConnected ? (
              <button type="button" onClick={disconnectWallet} disabled={busy}>
                {busy ? 'Connecting...' : 'Disconnect Wallet'}
              </button>
            ) : (
              connectors.map((item) => (
                <button
                  key={item.uid}
                  type="button"
                  className={item.id === 'walletConnect' ? 'secondary' : undefined}
                  onClick={() => connectWallet(item)}
                  disabled={busy}
                >
                  {pendingConnectorId === item.id ? 'Connecting...' : connectorLabel(item)}
                </button>
              ))
            )}
          </div>
          <p className="wallet-address">{address || 'No wallet connected'}</p>
          {status && <p className="status">{status}</p>}
        </div>
      </header>
      <section className="grid">
        <article className="card">
          <h2>V2 Pools (classic SAMM/VAMM)</h2>
          <label>
            V2 pool address
            <input value={v2Pool} onChange={(event) => setV2Pool(event.target.value)} placeholder="0x..." />
          </label>
          <label>
            Fee (%)
            <input value={v2Fee} onChange={(event) => setV2Fee(event.target.value)} placeholder="0.3" />
          </label>
          <div className="actions">
            <button type="button" className="secondary" onClick={readV2Fee} disabled={v2Busy}>
              {v2Busy ? 'Working...' : 'Read Fee'}
            </button>
            <button type="button" onClick={updateV2Fee} disabled={v2Busy || !isConnected}>
              {v2Busy ? 'Working...' : 'Update Fee'}
            </button>
          </div>
          <p className="manager">
            Manager: <code>{V2_MANAGER}</code>
          </p>
          {v2Result && (
            <p className="result">
              Current: {v2Result}
            </p>
          )}
          {v2Status && <p className="status">{v2Status}</p>}
        </article>
        <article className="card">
          <h2>2THICK CL Pools</h2>
          <label>
            2THICK CL pool address
            <input value={clPool} onChange={(event) => setClPool(event.target.value)} placeholder="0x..." />
          </label>
          <label>
            Fee (%)
            <input value={clFee} onChange={(event) => setClFee(event.target.value)} placeholder="0.3" />
          </label>
          <div className="actions">
            <button type="button" className="secondary" onClick={readClFee} disabled={clBusy}>
              {clBusy ? 'Working...' : 'Read Fee'}
            </button>
            <button type="button" onClick={updateClFee} disabled={clBusy || !isConnected}>
              {clBusy ? 'Working...' : 'Update Fee'}
            </button>
          </div>
          <p className="manager">
            Manager: <code>{CL_MANAGER}</code>
          </p>
          {clResult && (
            <p className="result">
              Current: {clResult}
            </p>
          )}
          {clStatus && <p className="status">{clStatus}</p>}
        </article>
      </section>
    </main>
  )
}
