import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // S'assurer que l'URL n'a pas de slash final
    hmr: {
      host: 'localhost',
    },
  },
  define: {
    // Définir globalement l'URL pour WalletConnect
    'global.window.location.href': JSON.stringify('http://localhost:5173'),
  }
})
