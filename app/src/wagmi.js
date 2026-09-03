import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

const RPC_URL = 'https://base-rpc.publicnode.com'

export const config = createConfig({
  chains: [base],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [base.id]: http(RPC_URL),
  },
  multiInjectedProviderDiscovery: false,
})

export { RPC_URL }
