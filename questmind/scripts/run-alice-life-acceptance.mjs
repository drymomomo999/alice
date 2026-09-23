import { createServer } from 'vite'

const memory = new Map()
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
  clear: () => memory.clear(),
  key: index => [...memory.keys()][index] ?? null,
  get length() { return memory.size },
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
})
try {
  const module = await server.ssrLoadModule('/src/services/aliceLife.acceptance.ts')
  const passed = module.runAliceLifeAcceptanceSuite()
  console.log(`Alice life acceptance: ${passed.length}/12 passed`)
  for (const name of passed) console.log(`  PASS ${name}`)
} finally {
  await server.close()
}
