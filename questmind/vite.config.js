import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// 检测是否在 Tauri 环境下（tauri dev 会注入 TAURI_ENV_TARGET_TRIPLE）
const isTauri = !!process.env.TAURI_ENV_TARGET_TRIPLE;

// https://vite.dev/config/
export default defineConfig({
    // Capacitor 的 file:// / capacitor:// 协议要求相对路径
    base: './',
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    // Tauri 要求 5173 固定端口，且不需要 host:true（用 localhost 即可）
    // macOS WebView 用 127.0.0.1，Vite 默认 localhost 兼容
    server: {
        port: 5173,
        host: isTauri ? '127.0.0.1' : true,
        strictPort: true,
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
        // ===== 开发环境不设置 CSP，避免干扰 PDF 预览（blob URL iframe 等） =====
        // 线上部署时由 nginx / CDN 配置 CSP
        // headers: {
        //     'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://njecytkavzhrmlgzwwkm.supabase.co; font-src 'self' data:; frame-src 'self' blob:; connect-src 'self' https://*.supabase.co https://*.deepseek.com wss://*;"
        // }
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
});
