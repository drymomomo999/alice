import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true } })
try { await server.ssrLoadModule('/scripts/profile-recovery.acceptance.ts') } finally { await server.close() }
