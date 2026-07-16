import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'

export default class LoggerMiddleware {
  async handle(ctx: HttpContext, next: NextFn): Promise<void> {
    const startedAt = performance.now()
    await next()

    const status = ctx.response.getStatus()
    const payload = {
      request_id: ctx.requestId,
      method: ctx.request.method(),
      path: ctx.request.url(),
      status,
      duration_ms: Math.round((performance.now() - startedAt) * 100) / 100,
      actor_user_id: ctx.auth.user?.id,
    }

    if (status >= 500) {
      logger.error(payload, 'HTTP request failed')
    } else if (status >= 400) {
      logger.warn(payload, 'HTTP request rejected')
    }
  }
}
