import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'

import { sendInvite } from '../../lib/invite.js'
import { getRedis } from '../redis.js'

const app = new Hono()

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

function sanitizeCode(code) {
  if (typeof code !== 'string') return ''
  const trimmed = code.trim()
  if (!trimmed) return ''
  if (trimmed.length > 64) return ''
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return ''
  return trimmed
}

const UNLOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

async function releaseLock(redis, lockKey, lockValue) {
  try {
    await redis.eval(UNLOCK_LUA, 1, lockKey, lockValue)
  } catch (err) {
    console.error('[redis] release lock error:', err)
  }
}

app.post('/invite', async (c) => {
  const body = await c.req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const code = sanitizeCode(body?.code)

  if (!email || !isValidEmail(email)) {
    return c.json({ success: false, error: '请输入有效的邮箱地址' }, 400)
  }
  if (!code) {
    return c.json({ success: false, error: '请输入有效的兑换码' }, 400)
  }

  const accountId = process.env.CHATGPT_ACCOUNT_ID
  const token = process.env.CHATGPT_TOKEN

  if (!accountId || !token) {
    return c.json({ success: false, error: '服务配置错误' }, 500)
  }

  let redis
  try {
    redis = getRedis()
  } catch (err) {
    console.error(err)
    return c.json({ success: false, error: 'Redis 未配置' }, 500)
  }

  const codeKey = `code:${code}`
  const lockKey = `code_lock:${code}`
  const lockValue = randomUUID()

  const locked = await redis.set(lockKey, lockValue, 'PX', 120_000, 'NX')
  if (locked !== 'OK') {
    return c.json({ success: false, error: '兑换码正在使用，请稍后重试' }, 409)
  }

  try {
    const raw = await redis.get(codeKey)
    if (!raw) {
      return c.json({ success: false, error: '兑换码无效' }, 400)
    }

    let record
    try {
      record = JSON.parse(raw)
    } catch {
      record = null
    }

    if (!record || typeof record !== 'object') {
      return c.json({ success: false, error: '兑换码数据损坏，请联系管理员' }, 500)
    }

    if (record.used) {
      return c.json({ success: false, error: '兑换码已被使用' }, 400)
    }

    const result = await sendInvite(email, accountId, token)
    if (!result.success) {
      return c.json(
        { success: false, error: result.message || '邀请发送失败', data: result.data },
        502
      )
    }

    const usedAt = new Date().toISOString()
    const updated = {
      ...record,
      used: true,
      usedAt,
      usedBy: email,
    }

    await redis.set(codeKey, JSON.stringify(updated))

    return c.json({
      success: true,
      message: result.message || '邀请已发送',
      data: result.data,
    })
  } finally {
    await releaseLock(redis, lockKey, lockValue)
  }
})

export default app
