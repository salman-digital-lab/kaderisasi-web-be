import { HttpContext } from '@adonisjs/core/http'
import PublicUser from '#models/public_user'
import Profile from '#models/profile'
import ActivityRegistration from '#models/activity_registration'
import { updateProfileValidator } from '#validators/profile_validator'
import { errors } from '@vinejs/vine'

export default class ProfilesController {
  async show({ response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const id = user.id

      const userData = await PublicUser.find(id)
      const profile = await Profile.query()
        .select('*')
        .where('user_id', id)
        .preload('university')
        .preload('province')
        .preload('city')
        .firstOrFail()

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: { userData, profile },
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async update({ request, response, auth }: HttpContext) {
    try {
      const payload = await updateProfileValidator.validate(request.all())
      const id = auth.user?.id
      const profile = await Profile.findByOrFail('user_id', id)
      const updated = await profile.merge(payload).save()

      return response.ok({
        message: 'UPDATE_DATA_SUCCESS',
        data: updated,
      })
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.internalServerError({
          message: error.messages[0]?.message || 'GENERAL_ERROR',
          error: error.messages,
        })
      }
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async activities({ response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const id = user.id
      let activities = {}
      activities = await ActivityRegistration.query()
        .select('*')
        .where('user_id', id)
        .preload('activity')

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: activities,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.stack,
      })
    }
  }
}
