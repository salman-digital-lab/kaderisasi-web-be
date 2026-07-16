import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

type RateBucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateBucket>()
const MAX_BUCKETS = 10_000

function removeExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

/**
 * Small process-local safeguard for public certificate lookups. Production
 * deployments with multiple instances should additionally enforce the same
 * policy at the gateway or a shared Redis-backed rate limiter.
 */
export default class PublicCertificateThrottleMiddleware {
  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { limit?: number; windowMs?: number } = {}
  ): Promise<void> {
    const limit = options.limit ?? 30
    const windowMs = options.windowMs ?? 60_000
    const now = Date.now()

    if (buckets.size >= MAX_BUCKETS) {
      removeExpiredBuckets(now)
      if (buckets.size >= MAX_BUCKETS) {
        buckets.delete(buckets.keys().next().value as string)
      }
    }

    const key = ctx.request.ip()
    const current = buckets.get(key)
    const bucket =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    bucket.count += 1
    buckets.set(key, bucket)

    const remaining = Math.max(limit - bucket.count, 0)
    const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)
    ctx.response.header('RateLimit-Limit', String(limit))
    ctx.response.header('RateLimit-Remaining', String(remaining))
    ctx.response.header('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > limit) {
      ctx.response.header('Retry-After', String(retryAfterSeconds))
      ctx.response.header('Cache-Control', 'no-store, private')
      ctx.response.tooManyRequests({ message: 'TOO_MANY_REQUESTS' })
      return
    }

    await next()
  }
}
