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
  const module = await server.ssrLoadModule('/src/services/aliceRelationship.acceptance.ts')
  const passed = module.runRelationshipAcceptanceSuite()
  console.log(`Alice relationship acceptance: ${passed.length}/20 passed`)
  for (const name of passed) console.log(`  PASS ${name}`)
} finally {
  await server.close()
}
