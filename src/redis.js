import Redis from 'ioredis'

let redisClient

export function getRedis() {
  if (redisClient) return redisClient

  const redisUrl = process.env.REDIS_URL
  console.log('[redis] REDIS_URL exists:', !!redisUrl)
  if (!redisUrl) {
    console.error('[redis] REDIS_URL is not set!')
    throw new Error('Missing required env var: REDIS_URL')
  }

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  })

  redisClient.on('error', (err) => {
    console.error('[redis] error:', err)
  })

  return redisClient
}

