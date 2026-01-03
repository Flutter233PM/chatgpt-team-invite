import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import adminRoutes from './routes/admin.js'
import inviteRoutes from './routes/invite.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '../public')
const indexHtmlPath = path.join(publicDir, 'index.html')
const adminHtmlPath = path.join(publicDir, 'admin.html')

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Password'],
    maxAge: 600,
  })
)

app.route('/api', inviteRoutes)
app.route('/api/admin', adminRoutes)

app.get('/', serveStatic({ path: indexHtmlPath }))
app.get('/index.html', serveStatic({ path: indexHtmlPath }))
app.get('/admin', serveStatic({ path: adminHtmlPath }))
app.get('/admin.html', serveStatic({ path: adminHtmlPath }))

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ success: false, error: 'Not Found' }, 404)
  }
  return c.text('Not Found', 404)
})

app.onError((err, c) => {
  console.error(err)
  if (c.req.path.startsWith('/api/')) {
    return c.json({ success: false, error: '服务器错误' }, 500)
  }
  return c.text('Internal Server Error', 500)
})

const port = Number.parseInt(process.env.PORT || '3000', 10)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`)
})
