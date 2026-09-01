import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

const RPC_URL = 'https://base-rpc.publicnode.com'

// Scale's public Reown project ID. Override with VITE_WC_PROJECT_ID if needed,
// and allowlist this app's origin in https://dashboard.reown.com.
export const WC_PROJECT_ID =
  import.meta.env.VITE_WC_PROJECT_ID || '37ff002895344fa2bf5c8f04e967ac8a'

const metadata = {
  name: 'Fee Console',
  description: 'scale.farm fee management',
  url: typeof window === 'undefined' ? 'https://0xgroot.github.io' : window.location.origin,
  icons: ['https://0xgroot.github.io/feeconsole/favicon.svg'],
}

export const config = createConfig({
  chains: [base],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: WC_PROJECT_ID,
      // Reown's hosted modal 403s on GitHub Pages because this origin is not
      // allowlisted. Pairing still works if we render the wc: URI ourselves.
      showQrModal: false,
      metadata,
      disableProviderPing: true,
    }),
  ],
  transports: {
    [base.id]: http(RPC_URL),
  },
  multiInjectedProviderDiscovery: false,
})

export { RPC_URL }
