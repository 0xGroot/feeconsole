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
const POOL_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function stable() view returns (bool)',
]
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
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

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

async function readTokenMeta(address) {
  const token = new Contract(address, ERC20_ABI, readProvider)
  const [symbol, name] = await Promise.all([
    token.symbol().catch(() => ''),
    token.name().catch(() => ''),
  ])
  const sym = String(symbol || '').trim()
  const nm = String(name || '').trim()
  return {
    symbol: sym || shortAddress(address),
    name: nm || sym || shortAddress(address),
  }
}

async function readPoolPair(poolAddress) {
  const pool = new Contract(poolAddress, POOL_ABI, readProvider)
  const [token0, token1] = await Promise.all([pool.token0(), pool.token1()])
  if (!isAddress(token0) || !isAddress(token1)) {
    throw Error('That contract does not look like an LP pool (missing token0/token1).')
  }
  const [tokenA, tokenB, lpSymbol, lpName, stable] = await Promise.all([
    readTokenMeta(token0),
    readTokenMeta(token1),
    pool.symbol().catch(() => ''),
    pool.name().catch(() => ''),
    pool.stable().catch(() => null),
  ])
  const pair = `${tokenA.symbol} / ${tokenB.symbol}`
  const names = `${tokenA.name} / ${tokenB.name}`
  let kind = ''
  if (stable === true) kind = 'sAMM'
  else if (stable === false) kind = 'vAMM'
  return {
    pool: poolAddress,
    pair,
    names,
    kind,
    lpSymbol: String(lpSymbol || '').trim(),
    lpName: String(lpName || '').trim(),
  }
}

function PairSummary({ pair }) {
  if (!pair) return null
  return (
    <div className="pair-box">
      <p className="pair-name">
        {pair.kind ? `${pair.kind} ` : ''}
        {pair.pair}
      </p>
      {pair.names !== pair.pair && <p className="pair-names">{pair.names}</p>}
      {pair.lpSymbol && pair.lpSymbol !== pair.pair && (
        <p className="pair-lp">
          LP token: <code>{pair.lpSymbol}</code>
          {pair.lpName && pair.lpName !== pair.lpSymbol ? ` · ${pair.lpName}` : ''}
        </p>
      )}
    </div>
  )
}

function ConfirmFeeDialog({
  title,
  pair,
  pool,
  currentFee,
  newFee,
  busy,
  onCancel,
  onConfirm,
}) {
  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={busy ? undefined : onCancel}
    >
      <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <p className="hint">Confirm this fee change before the wallet prompt.</p>
        <PairSummary pair={pair} />
        <p className="manager">
          Pool: <code>{pool}</code>
        </p>
        {currentFee && (
          <p className="confirm-row">
            Current fee: <strong>{currentFee}</strong>
          </p>
        )}
        <p className="confirm-row">
          New fee: <strong>{newFee}</strong>
        </p>
        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : 'Confirm update'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState('')
  const { address, isConnected, chainId, connector } = useAccount()
  const { connectAsync, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const busy = isConnecting || isSwitching

  const [v2Pool, setV2Pool] = useState('')
  const [v2Fee, setV2Fee] = useState('')
  const [v2Status, setV2Status] = useState('')
  const [v2Result, setV2Result] = useState('')
  const [v2Pair, setV2Pair] = useState(null)
  const [v2Confirm, setV2Confirm] = useState(false)
  const [v2Pending, setV2Pending] = useState(null)
  const [v2Busy, setV2Busy] = useState(false)

  const [clPool, setClPool] = useState('')
  const [clFee, setClFee] = useState('')
  const [clStatus, setClStatus] = useState('')
  const [clResult, setClResult] = useState('')
  const [clPair, setClPair] = useState(null)
  const [clConfirm, setClConfirm] = useState(false)
  const [clPending, setClPending] = useState(null)
  const [clBusy, setClBusy] = useState(false)

  async function connectWallet() {
    setStatus('')
    try {
      const next = connectors.find((item) => item.id === 'injected') ?? connectors[0]
      if (!next) throw Error('No wallet connector available.')
      const result = await connectAsync({ connector: next })
      if (result.chainId !== base.id) await switchChainAsync({ chainId: base.id })
      setStatus('Wallet connected on Base.')
    } catch (error) {
      setStatus(formatError(error, 'Could not connect wallet.'))
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

  async function loadPair(poolAddress, currentPair) {
    const address = poolAddress.trim()
    if (currentPair?.pool?.toLowerCase() === address.toLowerCase()) return currentPair
    return readPoolPair(address)
  }

  async function readV2Fee() {
    setV2Busy(true)
    setV2Status('')
    setV2Result('')
    setV2Confirm(false)
    try {
      const pool = v2Pool.trim()
      if (!isAddress(pool)) throw Error('Enter a valid V2 pool contract address.')
      const pair = await loadPair(pool, v2Pair)
      setV2Pair(pair)
      const [raw] = await new Contract(V2_MANAGER, FEE_ABI, readProvider).getSvammPools([pool])
      setV2Result(`${rawToFee(raw, 16)} (raw: ${raw.toString()})`)
      setV2Status('Fee read successfully.')
    } catch (error) {
      setV2Status(formatError(error, 'Failed to read V2 fee.'))
    } finally {
      setV2Busy(false)
    }
  }

  async function requestV2Update() {
    setV2Status('')
    try {
      const pool = v2Pool.trim()
      if (!isAddress(pool)) throw Error('Enter a valid V2 pool contract address.')
      const raw = feeToRaw(v2Fee, 16)
      setV2Busy(true)
      const pair = await loadPair(pool, v2Pair)
      setV2Pair(pair)
      setV2Pending({ raw, display: rawToFee(raw, 16) })
      setV2Confirm(true)
    } catch (error) {
      setV2Status(formatError(error, 'Could not prepare V2 fee update.'))
    } finally {
      setV2Busy(false)
    }
  }

  async function updateV2Fee() {
    if (!v2Pending) return
    setV2Busy(true)
    setV2Status('')
    try {
      const pool = v2Pool.trim()
      const raw = v2Pending.raw
      const tx = await new Contract(V2_MANAGER, FEE_ABI, await getSigner()).updateSvammFeesOf([pool], [raw])
      setV2Status(`Transaction sent: ${tx.hash}. Raw payload fee: ${raw.toString()}. Waiting for confirmation...`)
      await tx.wait()
      setV2Status(`Updated V2 fee to ${rawToFee(raw, 16)} (raw: ${raw.toString()}).`)
      setV2Result(`${rawToFee(raw, 16)} (raw: ${raw.toString()})`)
      setV2Confirm(false)
      setV2Pending(null)
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
    setClConfirm(false)
    try {
      const pool = clPool.trim()
      if (!isAddress(pool)) throw Error('Enter a valid 2THICK CL pool contract address.')
      const pair = await loadPair(pool, clPair)
      setClPair(pair)
      const [raw] = await new Contract(CL_MANAGER, FEE_ABI, readProvider).getPools([pool])
      setClResult(`${rawToFee(raw, 4)} (raw: ${raw.toString()})`)
      setClStatus('Fee read successfully.')
    } catch (error) {
      setClStatus(formatError(error, 'Failed to read 2THICK CL fee.'))
    } finally {
      setClBusy(false)
    }
  }

  async function requestClUpdate() {
    setClStatus('')
    try {
      const pool = clPool.trim()
      if (!isAddress(pool)) throw Error('Enter a valid 2THICK CL pool contract address.')
      const raw = feeToRaw(clFee, 4)
      if (raw > MAX_UINT24) throw Error('2THICK fee is too large (must fit uint24).')
      setClBusy(true)
      const pair = await loadPair(pool, clPair)
      setClPair(pair)
      setClPending({ raw, display: rawToFee(raw, 4) })
      setClConfirm(true)
    } catch (error) {
      setClStatus(formatError(error, 'Could not prepare 2THICK fee update.'))
    } finally {
      setClBusy(false)
    }
  }

  async function updateClFee() {
    if (!clPending) return
    setClBusy(true)
    setClStatus('')
    try {
      const pool = clPool.trim()
      const raw = clPending.raw
      const tx = await new Contract(CL_MANAGER, FEE_ABI, await getSigner()).updateFeesOf([pool], [raw])
      setClStatus(`Transaction sent: ${tx.hash}. Raw payload fee: ${raw.toString()}. Waiting for confirmation...`)
      await tx.wait()
      setClStatus(`Updated 2THICK fee to ${rawToFee(raw, 4)} (raw: ${raw.toString()}).`)
      setClResult(`${rawToFee(raw, 4)} (raw: ${raw.toString()})`)
      setClConfirm(false)
      setClPending(null)
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
          <button type="button" onClick={isConnected ? disconnectWallet : connectWallet} disabled={busy}>
            {busy ? 'Connecting...' : isConnected ? 'Disconnect Wallet' : 'Connect Wallet'}
          </button>
          <p className="wallet-address">{address || 'No wallet connected'}</p>
          {status && <p className="status">{status}</p>}
        </div>
      </header>
      <section className="grid">
        <article className="card">
          <h2>V2 Pools (classic SAMM/VAMM)</h2>
          <label>
            V2 pool address
            <input
              value={v2Pool}
              onChange={(event) => {
                setV2Pool(event.target.value)
                setV2Pair(null)
                setV2Result('')
                setV2Confirm(false)
              }}
              placeholder="0x..."
            />
          </label>
          <label>
            Fee (%)
            <input value={v2Fee} onChange={(event) => setV2Fee(event.target.value)} placeholder="0.3" />
          </label>
          <div className="actions">
            <button type="button" className="secondary" onClick={readV2Fee} disabled={v2Busy}>
              {v2Busy ? 'Working...' : 'Read Fee'}
            </button>
            <button type="button" onClick={requestV2Update} disabled={v2Busy || !isConnected}>
              {v2Busy ? 'Working...' : 'Update Fee'}
            </button>
          </div>
          <p className="manager">
            Manager: <code>{V2_MANAGER}</code>
          </p>
          <PairSummary pair={v2Pair} />
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
            <input
              value={clPool}
              onChange={(event) => {
                setClPool(event.target.value)
                setClPair(null)
                setClResult('')
                setClConfirm(false)
              }}
              placeholder="0x..."
            />
          </label>
          <label>
            Fee (%)
            <input value={clFee} onChange={(event) => setClFee(event.target.value)} placeholder="0.3" />
          </label>
          <div className="actions">
            <button type="button" className="secondary" onClick={readClFee} disabled={clBusy}>
              {clBusy ? 'Working...' : 'Read Fee'}
            </button>
            <button type="button" onClick={requestClUpdate} disabled={clBusy || !isConnected}>
              {clBusy ? 'Working...' : 'Update Fee'}
            </button>
          </div>
          <p className="manager">
            Manager: <code>{CL_MANAGER}</code>
          </p>
          <PairSummary pair={clPair} />
          {clResult && (
            <p className="result">
              Current: {clResult}
            </p>
          )}
          {clStatus && <p className="status">{clStatus}</p>}
        </article>
      </section>
      {v2Confirm && v2Pending && (
        <ConfirmFeeDialog
          title="Confirm V2 fee update"
          pair={v2Pair}
          pool={v2Pool.trim()}
          currentFee={v2Result}
          newFee={v2Pending.display}
          busy={v2Busy}
          onCancel={() => setV2Confirm(false)}
          onConfirm={updateV2Fee}
        />
      )}
      {clConfirm && clPending && (
        <ConfirmFeeDialog
          title="Confirm 2THICK fee update"
          pair={clPair}
          pool={clPool.trim()}
          currentFee={clResult}
          newFee={clPending.display}
          busy={clBusy}
          onCancel={() => setClConfirm(false)}
          onConfirm={updateClFee}
        />
      )}
    </main>
  )
}
