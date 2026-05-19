import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // 代理 Edge Function 请求到 Supabase，绕过浏览器 CORS 限制
      '/functions': {
        target: 'https://njecytkavzhrmlgzwwkm.supabase.co',
        changeOrigin: true,
        secure: true,
      },
      // 代理 REST API 请求（备用）
      '/rest/v1': {
        target: 'https://njecytkavzhrmlgzwwkm.supabase.co',
        changeOrigin: true,
        secure: true,
      },
      // 代理 DeepSeek API 请求，绕过浏览器 CORS 限制
      '/deepseek-api': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/deepseek-api/, ''),
        headers: {
          'Origin': 'https://api.deepseek.com',
        },
      },
    },
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://njecytkavzhrmlgzwwkm.supabase.co; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.deepseek.com wss://*;"
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
