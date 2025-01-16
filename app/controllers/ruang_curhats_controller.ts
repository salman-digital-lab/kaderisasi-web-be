import type { HttpContext } from '@adonisjs/core/http'
import RuangCurhat from '#models/ruang_curhat'
import { storeRuangCurhatValidator } from '#validators/ruang_curhat_validator'

export default class RuangCurhatsController {
  async store({ auth, request, response }: HttpContext) {
    const payload = await storeRuangCurhatValidator.validate(request.all())
    const userId = auth.user?.id
    try {
      const insert = {
        status: 0,
        user_id: userId,
      }

      const ruangCurhat = await RuangCurhat.create({ ...payload, ...insert })
      return response.ok({
        messages: 'CREATE_DATA_SUCCESS',
        data: ruangCurhat,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async history({ auth, response }: HttpContext) {
    const id = auth.user?.id
    try {
      const histories = await RuangCurhat.query().where({ user_id: id }).preload('adminUser')
      return response.ok({
        messages: 'GET_DATA_SUCCESS',
        data: histories,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }
}
