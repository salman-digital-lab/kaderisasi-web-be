import type { HttpContext } from '@adonisjs/core/http'
import Achievement from '#models/achievement'
import {
  activityHistory,
  consultationHistory,
  achievementHistory,
  historyQuery,
} from '#services/profile_history_service'

export default class ProfileHistoriesController {
  async index({ auth, params, request, response }: HttpContext): Promise<unknown> {
    response.header('Cache-Control', 'private, no-store')
    const query = historyQuery(request.qs())
    const userId = auth.getUserOrFail().id
    const data =
      params.section === 'activities'
        ? await activityHistory(userId, query)
        : params.section === 'consultations'
          ? await consultationHistory(userId, query)
          : params.section === 'achievements'
            ? await achievementHistory(userId, query)
            : null
    if (!data) return response.notFound({ message: 'NOT_FOUND' })
    return response.ok({ message: 'GET_DATA_SUCCESS', data })
  }

  async achievement({ auth, params, response }: HttpContext): Promise<unknown> {
    response.header('Cache-Control', 'private, no-store')
    if (!/^[1-9]\d*$/.test(params.id) || Number(params.id) > 2147483647)
      return response.notFound({ message: 'ACHIEVEMENT_NOT_FOUND' })
    const row = await Achievement.query()
      .where('id', params.id)
      .where('user_id', auth.getUserOrFail().id)
      .first()
    if (!row) return response.notFound({ message: 'ACHIEVEMENT_NOT_FOUND' })
    return response.ok({ message: 'GET_DATA_SUCCESS', data: row })
  }
}
