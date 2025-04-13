import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from './wagmi.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Configuration du client de requête avec des optimisations de performances
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 0, // Pas de tentatives de nouvelle exécution
      refetchOnWindowFocus: false, // Désactiver le rafraîchissement lors du focus de la fenêtre
      networkMode: 'offlineFirst', // Mode hors ligne en premier pour une meilleure UX
    },
  },
});

// Assurez-vous que l'URL n'a pas de slash final pour éviter les erreurs WalletConnect
const appUrl = window.location.href.replace(/\/$/, '');

// Options personnalisées pour RainbowKit
const customDarkTheme = darkTheme({
  accentColor: '#9333ea', // Couleur d'accent personnalisée (violet)
  accentColorForeground: 'white',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <WagmiProvider config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider theme={customDarkTheme} modalSize="compact">
        <App />
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>,
)
