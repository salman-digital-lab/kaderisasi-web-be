import { HttpContext } from '@adonisjs/core/http'
import database from '@adonisjs/lucid/services/db'
import { errors } from '@vinejs/vine'
import PublicUser from '#models/public_user'
import { selfSubmitValidator } from '#validators/member_validator'
import { generateMemberId } from '../helpers/member_id_generator.js'

export default class MembersController {
  async submit({ request, response }: HttpContext) {
    try {
      const payload = await selfSubmitValidator.validate(request.all())

      await database.transaction(async (trx) => {
        const user = new PublicUser()
        user.email = null
        user.password = null
        user.accountStatus = 'no_account'
        user.useTransaction(trx)
        await user.save()

        user.memberId = generateMemberId(user.id)
        await user.save()

        // @ts-ignore cannot find a solution, it is error when using this monorepo
        await user.related('profile').create({
          name: payload.name,
          gender: payload.gender ?? undefined,
          whatsapp: payload.whatsapp ?? undefined,
          instagram: payload.instagram ?? undefined,
          provinceId: payload.province_id ?? undefined,
          cityId: payload.city_id ?? undefined,
          country: payload.country ?? undefined,
          placeOfBirth: payload.place_of_birth ?? undefined,
          birthDate: payload.birth_date ?? undefined,
          originProvinceId: payload.origin_province_id ?? undefined,
          originCityId: payload.origin_city_id ?? undefined,
          educationHistory: payload.education_history ?? [],
          workHistory: payload.work_history ?? [],
          extraData: payload.extra_data ?? {},
        })
      })

      return response.created({
        message: 'SUBMIT_SUCCESS',
      })
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.internalServerError({
          message: error.messages[0]?.message || 'VALIDATION_ERROR',
          error: error.messages,
        })
      }
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }
}
