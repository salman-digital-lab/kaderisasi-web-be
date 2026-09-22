import type { HttpContext } from '@adonisjs/core/http'
import NotificationService from '#services/notification_service'
import {
  notificationListValidator,
  notificationReadAllValidator,
} from '#validators/notification_validator'
import { errors } from '@vinejs/vine'

const service = new NotificationService()
export default class NotificationsController {
  private async handle(
    ctx: HttpContext,
    action: (userId: number) => Promise<unknown>
  ): Promise<void> {
    ctx.response.header('Cache-Control', 'private, no-store')
    try {
      const user = await ctx.auth.authenticate()
      if (user.accountStatus !== 'active') {
        ctx.response.unauthorized({ message: 'UNAUTHORIZED' })
        return
      }
      ctx.response.ok({ message: 'GET_DATA_SUCCESS', data: await action(user.id) })
    } catch (error: unknown) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        ctx.response.status(422).send({ message: 'VALIDATION_ERROR', errors: error.messages })
      } else if (
        error instanceof Error &&
        'status' in error &&
        typeof error.status === 'number' &&
        [404, 422].includes(error.status)
      ) {
        ctx.response.status(error.status).send({ message: error.message })
      } else {
        throw error
      }
    }
  }
  async index(ctx: HttpContext): Promise<void> {
    return this.handle(ctx, async (id) => {
      const input = await ctx.request.validateUsing(notificationListValidator)
      return service.list(id, input.cursor, input.unread === 'true')
    })
  }
  async count(ctx: HttpContext): Promise<void> {
    return this.handle(ctx, (id) => service.count(id))
  }
  async show(ctx: HttpContext): Promise<void> {
    return this.handle(ctx, (id) => service.show(id, this.id(ctx)))
  }
  async read(ctx: HttpContext): Promise<void> {
    return this.handle(ctx, (id) => service.read(id, this.id(ctx)))
  }
  async readAll(ctx: HttpContext): Promise<void> {
    return this.handle(ctx, async (id) => {
      const input = await ctx.request.validateUsing(notificationReadAllValidator)
      await service.readAll(id, input.cutoff)
      return null
    })
  }
  private id(ctx: HttpContext): number {
    const id = Number(ctx.params.id)
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
      throw Object.assign(new Error('NOTIFICATION_NOT_FOUND'), { status: 404 })
    }
    return id
  }
}
