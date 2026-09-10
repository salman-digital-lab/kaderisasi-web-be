import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import jwt from 'jsonwebtoken'
import env from '#start/env'

export default class CourseAudienceMiddleware {
  async handle(ctx: HttpContext, next: NextFn): Promise<unknown> {
    ctx.response.header('Cache-Control', 'private, no-store')
    try {
      const header = ctx.request.header('authorization') ?? ''
      if (!header.startsWith('Bearer ')) throw new Error('Missing bearer token')
      const claims = jwt.verify(header.slice(7), env.get('APP_KEY'), {
        algorithms: ['HS256'],
        audience: 'kaderisasi-public',
      })
      if (
        typeof claims !== 'object' ||
        typeof claims.exp !== 'number' ||
        claims.userId !== ctx.auth.user?.id
      )
        throw new Error('Invalid learner identity')
    } catch {
      return ctx.response.unauthorized({ message: 'UNAUTHORIZED' })
    }
    return next()
  }
}
