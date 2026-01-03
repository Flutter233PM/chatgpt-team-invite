import { Hono } from 'hono'
import { timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'

import { getRedis } from '../redis.js'

const app = new Hono()

function getClientIP(c) {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown'
}

async function logOperation(redis, type, data) {
  const log = {
    type,
    time: new Date().toISOString(),
    ...data,
  }
  try {
    await redis.lpush('logs', JSON.stringify(log))
    await redis.ltrim('logs', 0, 999)
  } catch (err) {
    console.error('[log] write error:', err)
  }
}

function getAdminPasswordFromRequest(c) {
  const bearer = c.req.header('authorization')
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim()
  }

  const basic = c.req.header('authorization')
  if (basic && basic.toLowerCase().startsWith('basic ')) {
    try {
      const raw = Buffer.from(basic.slice(6).trim(), 'base64').toString('utf8')
      const idx = raw.indexOf(':')
      if (idx >= 0) return raw.slice(idx + 1)
      return raw
    } catch {
      return null
    }
  }

  const legacy = c.req.header('x-admin-password')
  if (legacy) return legacy

  return null
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return nodeTimingSafeEqual(aBuf, bBuf)
}

function requireAdmin(c) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    return c.json({ success: false, error: '管理员密码未配置' }, 500)
  }

  const provided = getAdminPasswordFromRequest(c)
  if (!provided || !safeEqual(provided, expected)) {
    return c.json(
      { success: false, error: 'Unauthorized' },
      401,
      {
        'WWW-Authenticate': 'Bearer realm="admin"',
      }
    )
  }

  return null
}

function sanitizeCode(code) {
  if (typeof code !== 'string') return ''
  const trimmed = code.trim()
  if (!trimmed) return ''
  if (trimmed.length > 64) return ''
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return ''
  return trimmed
}

function generateCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

app.use('*', async (c, next) => {
  const res = requireAdmin(c)
  if (res) return res
  await next()
})

app.get('/codes', async (c) => {
  let redis
  try {
    redis = getRedis()
  } catch (err) {
    console.error(err)
    return c.json({ success: false, error: 'Redis 未配置' }, 500)
  }

  const all = []
  let cursor = '0'

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'code:*', 'COUNT', 200)
    cursor = nextCursor
    if (!keys.length) continue

    const pipeline = redis.pipeline()
    for (const key of keys) pipeline.get(key)
    const values = await pipeline.exec()

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const code = key.slice('code:'.length)
      const value = values?.[i]?.[1]
      if (!value) continue

      try {
        const record = JSON.parse(value)
        all.push({ code, ...record })
      } catch {
        all.push({ code, raw: value })
      }
    }
  } while (cursor !== '0')

  all.sort((a, b) => {
    const aT = Date.parse(a.createdAt || 0) || 0
    const bT = Date.parse(b.createdAt || 0) || 0
    return bT - aT
  })

  return c.json({ success: true, codes: all })
})

app.post('/codes', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ip = getClientIP(c)

  let redis
  try {
    redis = getRedis()
  } catch (err) {
    console.error(err)
    return c.json({ success: false, error: 'Redis 未配置' }, 500)
  }

  const now = new Date().toISOString()
  const record = {
    createdAt: now,
    used: false,
    usedAt: null,
    usedBy: null,
  }

  const requestedCodesRaw = Array.isArray(body.codes)
    ? body.codes.map(sanitizeCode).filter(Boolean)
    : []

  const single = sanitizeCode(body.code)
  if (single) requestedCodesRaw.push(single)

  const requestedCodes = [...new Set(requestedCodesRaw)]

  const length = Math.max(6, Math.min(Number(body.length || 10) || 10, 32))
  const count =
    requestedCodes.length > 0 ? requestedCodes.length : Math.max(1, Math.min(Number(body.count || 1) || 1, 200))

  const created = []
  const skipped = []

  if (requestedCodes.length > 0) {
    for (const code of requestedCodes) {
      const ok = await redis.set(`code:${code}`, JSON.stringify(record), 'NX')
      if (ok === 'OK') created.push(code)
      else skipped.push(code)
    }

    if (created.length > 0) {
      await logOperation(redis, 'code_create', { ip, count: created.length, codes: created.slice(0, 5).join(',') + (created.length > 5 ? '...' : '') })
    }

    if (skipped.length > 0) {
      return c.json(
        { success: false, error: '部分兑换码已存在', created, skipped },
        409
      )
    }

    return c.json({ success: true, codes: created })
  }

  let attempts = 0
  while (created.length < count && attempts < count * 20) {
    attempts++
    const code = generateCode(length)
    const ok = await redis.set(`code:${code}`, JSON.stringify(record), 'NX')
    if (ok === 'OK') created.push(code)
  }

  if (created.length !== count) {
    return c.json(
      { success: false, error: '生成兑换码失败，请重试', codes: created },
      500
    )
  }

  await logOperation(redis, 'code_create', { ip, count: created.length, codes: created.slice(0, 5).join(',') + (created.length > 5 ? '...' : '') })

  return c.json({ success: true, codes: created })
})

app.delete('/codes/:code', async (c) => {
  const code = sanitizeCode(c.req.param('code'))
  const ip = getClientIP(c)
  if (!code) {
    return c.json({ success: false, error: 'Invalid code' }, 400)
  }

  let redis
  try {
    redis = getRedis()
  } catch (err) {
    console.error(err)
    return c.json({ success: false, error: 'Redis 未配置' }, 500)
  }

  const deleted = await redis.del(`code:${code}`)
  if (!deleted) {
    return c.json({ success: false, error: 'Not Found' }, 404)
  }

  await logOperation(redis, 'code_delete', { ip, code })

  return c.json({ success: true })
})

app.get('/logs', async (c) => {
  let redis
  try {
    redis = getRedis()
  } catch (err) {
    console.error(err)
    return c.json({ success: false, error: 'Redis 未配置' }, 500)
  }

  const raw = await redis.lrange('logs', 0, 99)
  const logs = raw.map((item) => {
    try {
      return JSON.parse(item)
    } catch {
      return { raw: item }
    }
  })

  return c.json({ success: true, logs })
})

export default app
