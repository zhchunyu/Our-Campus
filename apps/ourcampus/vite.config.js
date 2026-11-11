import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { auvDevPlugin } from './server/auvMiddleware.js'

export default defineConfig(({ mode }) => ({
  plugins: [react(), auvDevPlugin(loadEnv(mode, process.cwd(), ''))],
}))
