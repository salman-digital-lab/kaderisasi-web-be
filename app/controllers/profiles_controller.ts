import { HttpContext } from '@adonisjs/core/http'
import PublicUser from '#models/public_user'
import Profile from '#models/profile'
import ActivityRegistration from '#models/activity_registration'
import { imageValidator, updateProfileValidator } from '#validators/profile_validator'
import { errors } from '@vinejs/vine'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { minioClient } from '#config/drive'
import fs from 'node:fs'
import env from '#start/env'

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

  async uploadPicture({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(imageValidator)
    try {
      const picture = payload.file

      if (!picture) {
        return response.badRequest({
          message: 'PICTURE_REQUIRED',
        })
      }

      if (!picture.isValid) {
        return response.badRequest({
          message: 'INVALID_PICTURE',
          error: picture.errors,
        })
      }

      const user = auth.getUserOrFail()
      const profile = await Profile.findByOrFail('user_id', user.id)

      // Delete old picture if exists
      if (profile.picture) {
        try {
          await minioClient.send(
            new DeleteObjectCommand({
              Bucket: env.get('DRIVE_BUCKET'),
              Key: profile.picture,
            })
          )
        } catch (error) {
          console.error('Error deleting old picture:', error)
        }
      }

      // Generate unique filename
      const fileName = `${user.id}_${Date.now()}.${picture.extname}`

      console.log(fileName, picture.headers['content-type'], picture)

      // Upload to MinIO
      const fileBuffer = fs.readFileSync(picture.tmpPath!)
      await minioClient.send(
        new PutObjectCommand({
          Bucket: env.get('DRIVE_BUCKET'),
          Key: fileName,
          Body: fileBuffer,
          ContentType: picture?.headers?.['content-type'] || 'application/octet-stream',
          ACL: 'public-read',
        })
      )

      // Update profile with new picture path
      profile.picture = fileName
      await profile.save()

      return response.ok({
        message: 'UPLOAD_SUCCESS',
        data: {
          picture: fileName,
        },
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }
}
