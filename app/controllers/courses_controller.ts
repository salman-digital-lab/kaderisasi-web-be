import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@vinejs/vine'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import env from '#start/env'
import { minioClient } from '#config/drive'
import { courseCompletionValidator } from '#validators/course_validator'
import {
  CourseAccessError,
  courseIdentifier,
  listCourses,
  showCourse,
  showLesson,
  recordCourseProgress,
  readableDocument,
} from '#services/course_service'

export default class CoursesController {
  private async respond(ctx: HttpContext, action: () => Promise<unknown>): Promise<unknown> {
    ctx.response.header('Cache-Control', 'private, no-store')
    try {
      return await action()
    } catch (error) {
      if (error instanceof CourseAccessError)
        return ctx.response.notFound({ message: error.message })
      if (error instanceof errors.E_VALIDATION_ERROR)
        return ctx.response.unprocessableEntity({
          message: 'VALIDATION_ERROR',
          errors: error.messages,
        })
      ctx.logger.error({ err: error }, 'Course request failed')
      return ctx.response.internalServerError({ message: 'GENERAL_ERROR' })
    }
  }
  async index(ctx: HttpContext): Promise<unknown> {
    return this.respond(ctx, async () =>
      ctx.response.ok({
        message: 'GET_DATA_SUCCESS',
        data: await listCourses(ctx.auth.user!.id, ctx.request.qs()),
      })
    )
  }
  async show(ctx: HttpContext): Promise<unknown> {
    return this.respond(ctx, async () =>
      ctx.response.ok({
        message: 'GET_DATA_SUCCESS',
        data: await showCourse(ctx.auth.user!.id, courseIdentifier(ctx.params.id)),
      })
    )
  }
  async lesson(ctx: HttpContext): Promise<unknown> {
    return this.respond(ctx, async () =>
      ctx.response.ok({
        message: 'GET_DATA_SUCCESS',
        data: await showLesson(
          ctx.auth.user!.id,
          courseIdentifier(ctx.params.id),
          courseIdentifier(ctx.params.lessonId)
        ),
      })
    )
  }
  async visit(ctx: HttpContext): Promise<unknown> {
    return this.respond(ctx, async () =>
      ctx.response.ok({
        message: 'UPDATE_DATA_SUCCESS',
        data: await recordCourseProgress(
          ctx.auth.user!.id,
          courseIdentifier(ctx.params.id),
          courseIdentifier(ctx.params.lessonId),
          null
        ),
      })
    )
  }
  async complete(ctx: HttpContext): Promise<unknown> {
    return this.respond(ctx, async () => {
      const { completed } = await ctx.request.validateUsing(courseCompletionValidator)
      return ctx.response.ok({
        message: 'UPDATE_DATA_SUCCESS',
        data: await recordCourseProgress(
          ctx.auth.user!.id,
          courseIdentifier(ctx.params.id),
          courseIdentifier(ctx.params.lessonId),
          completed
        ),
      })
    })
  }
  async download(ctx: HttpContext): Promise<unknown> {
    return this.respond(ctx, async () => {
      const document = await readableDocument(
        ctx.auth.user!.id,
        courseIdentifier(ctx.params.id),
        courseIdentifier(ctx.params.lessonId),
        courseIdentifier(ctx.params.documentId)
      )
      const bucket = env.get('DRIVE_BUCKET')
      if (!bucket) return ctx.response.serviceUnavailable({ message: 'COURSE_STORAGE_UNAVAILABLE' })
      const result = await minioClient.send(
        new GetObjectCommand({ Bucket: bucket, Key: document.storageKey })
      )
      if (!(result.Body instanceof Readable)) throw new Error('Missing PDF stream')
      ctx.response.header('Content-Type', 'application/pdf')
      ctx.response.header('X-Content-Type-Options', 'nosniff')
      ctx.response.header(
        'Content-Disposition',
        `attachment; filename="materi.pdf"; filename*=UTF-8''${encodeURIComponent(document.filename)}`
      )
      return ctx.response.stream(result.Body)
    })
  }
}
