import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, 'build-out')
const assetsDir = resolve(root, 'assets')

if (!existsSync(resolve(outDir, 'index.html'))) {
  throw new Error('build-out/index.html is missing. Run vite build first.')
}

if (existsSync(assetsDir)) {
  rmSync(assetsDir, { recursive: true, force: true })
}

cpSync(resolve(outDir, 'index.html'), resolve(root, 'index.html'))
cpSync(resolve(outDir, 'assets'), assetsDir, { recursive: true })

if (existsSync(resolve(outDir, 'favicon.svg'))) {
  cpSync(resolve(outDir, 'favicon.svg'), resolve(root, 'favicon.svg'))
}
