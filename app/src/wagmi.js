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
  url: 'https://scale.farm',
  icons: ['https://scale.farm/favicon.png'],
}

export const config = createConfig({
  chains: [base],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: WC_PROJECT_ID,
      showQrModal: true,
      metadata,
      disableProviderPing: true,
      qrModalOptions: {
        themeMode: 'dark',
      },
    }),
  ],
  transports: {
    [base.id]: http(RPC_URL),
  },
  multiInjectedProviderDiscovery: false,
})

export { RPC_URL }
