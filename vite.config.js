import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import tailwindcss from '@tailwindcss/vite'
import { build as esbuild } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Bundles src/content/index.js as a standalone IIFE without CRXJS's
 * chrome.runtime.getURL dynamic import loader, which Chrome blocks on some
 * YouTube frames when modules are code-split or export symbols for tests.
 */
function bundleContentScriptIife() {
  return {
    name: 'bundle-content-script-iife',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      const manifestPath = path.join(distDir, 'manifest.json')
      if (!fs.existsSync(manifestPath)) return

      const entryPath = path.resolve(__dirname, 'src/content/index.js')
      const outPath = path.join(distDir, 'assets/content-index.js')

      await esbuild({
        entryPoints: [entryPath],
        bundle: true,
        format: 'iife',
        minify: true,
        target: 'chrome120',
        outfile: outPath,
      })

      const distManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (Array.isArray(distManifest.content_scripts)) {
        const obsoleteLoaders = new Set()
        distManifest.content_scripts = distManifest.content_scripts.map(
          (cs) => {
            if (!Array.isArray(cs.js)) return cs
            const nextJs = cs.js.map((file) => {
              if (file.includes('index.js-loader')) {
                obsoleteLoaders.add(file)
                return 'assets/content-index.js'
              }
              return file
            })
            return { ...cs, js: nextJs }
          }
        )

        for (const loaderRel of obsoleteLoaders) {
          const loaderAbs = path.join(distDir, loaderRel)
          if (fs.existsSync(loaderAbs)) {
            fs.rmSync(loaderAbs)
          }
        }
      }

      fs.writeFileSync(manifestPath, JSON.stringify(distManifest, null, 2))
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    tailwindcss(),
    bundleContentScriptIife(),
  ],
})
