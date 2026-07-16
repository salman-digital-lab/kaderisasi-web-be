import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    requestId: string
  }
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

export default class RequestIdMiddleware {
  async handle(ctx: HttpContext, next: NextFn): Promise<void> {
    const suppliedRequestId = ctx.request.header('x-request-id')?.trim()
    ctx.requestId =
      suppliedRequestId &&
      suppliedRequestId.length <= 128 &&
      REQUEST_ID_PATTERN.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID()
    ctx.response.header('X-Request-Id', ctx.requestId)

    await next()
  }
}
