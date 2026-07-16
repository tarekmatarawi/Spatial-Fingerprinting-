import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev-only endpoint: lets the admin page save site data back into
// src/data/sites.json while running `npm run dev`. It does not exist on the
// deployed static site, so the published admin page can't modify anything.
function sitesSaveEndpoint() {
  return {
    name: 'sites-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-sites', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const sites = JSON.parse(body)
            if (!Array.isArray(sites)) throw new Error('Expected an array of sites')
            fs.writeFileSync(
              path.resolve(dirname, 'src/data/sites.json'),
              JSON.stringify(sites, null, 2)
            )
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// Dev-only endpoint: lets the viewer save computed isovist results back into
// src/data/results.json while running `npm run dev`. Mirrors sitesSaveEndpoint
// above — it does not exist on the deployed static site, so saving there fails
// gracefully and the viewer falls back to an inline "local only" message.
function resultsSaveEndpoint() {
  return {
    name: 'results-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-results', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const results = JSON.parse(body)
            if (!Array.isArray(results)) throw new Error('Expected an array of results')
            fs.writeFileSync(
              path.resolve(dirname, 'src/data/results.json'),
              JSON.stringify(results, null, 2)
            )
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// Dev-only endpoint: persists the live viewer state (selected plaza + current
// vantage point/direction) to src/data/viewer-state.json while running
// `npm run dev`, so a fresh tab reopens where the researcher left off. Like the
// other two it doesn't exist on the deployed static site (there the URL query
// keeps carrying the state instead).
function viewerStateSaveEndpoint() {
  return {
    name: 'viewer-state-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-viewer-state', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const state = JSON.parse(body)
            if (state === null || typeof state !== 'object' || Array.isArray(state)) {
              throw new Error('Expected a viewer-state object')
            }
            fs.writeFileSync(
              path.resolve(dirname, 'src/data/viewer-state.json'),
              JSON.stringify(state, null, 2)
            )
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// Dev-only endpoint: appends one participant's survey submission to
// src/data/survey-responses.json. Unlike the endpoints above (which replace the
// whole file), survey participants are independent, so this reads the current
// array and pushes the new record. On the deployed site this endpoint is absent;
// a serverless function takes its place at deploy time.
function surveySaveEndpoint() {
  return {
    name: 'survey-save-endpoint',
    configureServer(server) {
      server.middlewares.use('/__save-survey', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const submission = JSON.parse(body)
            if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
              throw new Error('Expected a submission object')
            }
            const file = path.resolve(dirname, 'src/data/survey-responses.json')
            const existing = JSON.parse(fs.readFileSync(file, 'utf8') || '[]')
            existing.push(submission)
            fs.writeFileSync(file, JSON.stringify(existing, null, 2))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, total: existing.length }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

const IMAGES_DIR = path.resolve(dirname, 'public/images')
const SAFE_IMAGE_NAME = /^[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/

// Dev-only endpoint: lets the admin page upload a site's Street View screenshot
// straight from disk instead of the researcher manually copying files into
// public/images/. The filename travels in the `x-filename` header (sanitized
// against a strict allowlist — this writes to disk from a request, so anything
// resembling a path is rejected outright, not just stripped); the raw image
// bytes are the request body. Absent on the deployed static site.
function uploadImageEndpoint() {
  return {
    name: 'upload-image-endpoint',
    configureServer(server) {
      server.middlewares.use('/__upload-image', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        const name = req.headers['x-filename']
        if (typeof name !== 'string' || !SAFE_IMAGE_NAME.test(name)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          return res.end(
            JSON.stringify({
              ok: false,
              error: 'Filename must be lowercase letters/numbers/dashes, ending in .jpg/.jpeg/.png/.webp',
            })
          )
        }
        const chunks = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
          try {
            fs.mkdirSync(IMAGES_DIR, { recursive: true })
            const dest = path.join(IMAGES_DIR, name)
            fs.writeFileSync(dest, Buffer.concat(chunks))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, path: `/images/${name}` }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/Spatial-Fingerprinting-/',
  plugins: [
    react(),
    tailwindcss(),
    sitesSaveEndpoint(),
    resultsSaveEndpoint(),
    viewerStateSaveEndpoint(),
    surveySaveEndpoint(),
    uploadImageEndpoint(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
