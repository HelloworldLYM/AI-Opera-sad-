import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number.parseInt(process.argv[2] || '5180', 10)
const root = resolve(process.cwd())
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.binarypb': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.obj': 'text/plain; charset=utf-8',
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(body)
}

function resolveRequestPath(url) {
  const parsed = new URL(url, 'http://127.0.0.1')
  const pathname = decodeURIComponent(parsed.pathname)
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const filePath = resolve(join(root, relativePath))
  if (!filePath.startsWith(root)) return null
  if (!existsSync(filePath)) {
    const publicPath = resolve(join(root, 'public', relativePath))
    if (publicPath.startsWith(root) && existsSync(publicPath)) return publicPath
  }
  return filePath
}

const server = createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || '/')
  if (!filePath) {
    send(res, 403, 'Forbidden')
    return
  }

  let target = filePath
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = join(target, 'index.html')
  }

  if (!existsSync(target) || !statSync(target).isFile()) {
    send(res, 404, 'Not found')
    return
  }

  const ext = extname(target).toLowerCase()
  res.writeHead(200, {
    'content-type': mimeTypes[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(target).pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Static preview: http://127.0.0.1:${port}/`)
  console.log(`Stage preview:  http://127.0.0.1:${port}/stage.html?mode=lite`)
  console.log(`Root: ${root}`)
})

process.on('SIGTERM', () => server.close())
