import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Unprefixed env vars stay in the dev server; they are never bundled into
  // browser code. The proxy attaches the API key so the web app can call the
  // protected backend without exposing the key to users.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Let ngrok/tunnel hostnames reach the dev server.
      allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          headers: env.PLANT_DOCTOR_API_KEY
            ? { 'X-API-Key': env.PLANT_DOCTOR_API_KEY }
            : {},
        },
      },
    },
  }
})
