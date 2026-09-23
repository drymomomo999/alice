import { build } from 'vite'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'

const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, '.courseware-test-dist')

await rm(outDir, { recursive: true, force: true })
try {
  await build({
    root,
    logLevel: 'silent',
    build: {
      outDir,
      emptyOutDir: true,
      lib: { entry: resolve(root, 'scripts/courseware-study.acceptance.ts'), formats: ['es'], fileName: () => 'acceptance.mjs' },
      rollupOptions: { external: [/^node:/] },
    },
  })
  await import(`${pathToFileURL(resolve(outDir, 'acceptance.mjs')).href}?t=${Date.now()}`)
} finally {
  await rm(outDir, { recursive: true, force: true })
}
