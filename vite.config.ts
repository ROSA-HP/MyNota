/// <reference types="vitest/config" />
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Strict CSP for production builds (the dev server needs inline scripts for HMR, so it is
 * skipped there). Hosting should also send it as a header, plus frame-ancestors 'none'.
 */
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  const supabase = new URL(supabaseUrl)
  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the OCR engine compile its WebAssembly; no JS eval is allowed.
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    // AI calls go straight from the browser to the provider with the student's own key. Students
    // can add any OpenAI-compatible endpoint, so any https origin is allowed, plus plain http
    // only for model servers on their own computer. Scripts stay locked to 'self'.
    `connect-src 'self' ${supabase.origin} wss://${supabase.host} https: http://localhost:* http://127.0.0.1:*`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'mynota-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      },
      {
        tag: 'meta',
        attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' },
        injectTo: 'head-prepend',
      },
    ],
  }
}

/**
 * Serves (dev) and copies (build) the files pdf.js and Tesseract load at run time from our own
 * origin, so the strict CSP holds and no third-party CDN sees students' traffic:
 *   /pdfjs/{cmaps,standard_fonts,wasm,iccs}/…   /ocr/worker.min.js   /ocr/core/…   /ocr/lang/…
 * They are only downloaded when a student uploads a PDF or photos.
 */
function documentAssets(): Plugin {
  const require = createRequire(import.meta.url)
  const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`))
  const pdfjs = pkgDir('pdfjs-dist')
  const tesseract = pkgDir('tesseract.js')
  const core = dirname(
    createRequire(join(tesseract, 'package.json')).resolve('tesseract.js-core/package.json'),
  )
  const files = new Map<string, string>()
  for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    const abs = join(pdfjs, dir)
    if (existsSync(abs))
      for (const f of readdirSync(abs)) files.set(`pdfjs/${dir}/${f}`, join(abs, f))
  }
  files.set('ocr/worker.min.js', join(tesseract, 'dist/worker.min.js'))
  for (const f of readdirSync(core))
    if (f.endsWith('-lstm.wasm.js')) files.set(`ocr/core/${f}`, join(core, f))
  for (const lang of ['eng', 'ara', 'deu'])
    files.set(
      `ocr/lang/${lang}.traineddata.gz`,
      join(pkgDir(`@tesseract.js-data/${lang}`), '4.0.0_best_int', `${lang}.traineddata.gz`),
    )
  const types: Record<string, string> = {
    js: 'text/javascript',
    wasm: 'application/wasm',
    gz: 'application/octet-stream',
    bcmap: 'application/octet-stream',
    pfb: 'application/octet-stream',
    ttf: 'font/ttf',
    icc: 'application/vnd.iccprofile',
  }
  return {
    name: 'mynota-document-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\//, '')
        const file = files.get(path)
        if (!file) return next()
        res.setHeader(
          'Content-Type',
          types[path.split('.').pop() ?? ''] ?? 'application/octet-stream',
        )
        res.setHeader('Content-Length', String(statSync(file).size))
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const [fileName, file] of files)
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    documentAssets(),
    contentSecurityPolicy(
      loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? 'https://invalid.supabase.co',
    ),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  envPrefix: ['VITE_'],
  // The app version goes into error reports (Phase 7.6).
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      (
        JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
          version: string
        }
      ).version,
    ),
  },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks so app updates don't re-download libraries.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'i18n', test: /node_modules[\\/](i18next|react-i18next)[\\/]/ },
            // Loaded only when a student uploads a PDF or photos.
            { name: 'pdfjs', test: /node_modules[\\/]pdfjs-dist[\\/]/ },
            { name: 'ocr', test: /node_modules[\\/]tesseract\.js[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
  },
}))
