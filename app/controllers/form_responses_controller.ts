import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import vine from '@vinejs/vine'
import jwt from 'jsonwebtoken'
import db from '@adonisjs/lucid/services/db'
import CustomForm from '#models/custom_form'
import { minioClient } from '#config/drive'
import env from '#start/env'
import { uploadFormAttachment, formUploadDependencies } from '#services/form_upload_service'
import {
  createFormSession,
  FormRequestError,
  lockFormSession,
  schemaHash,
  submitStandalone,
} from '#services/form_session_service'

const submissionValidator = vine.compile(
  vine.object({
    session_token: vine.string().regex(/^[a-f0-9]{64}$/),
    answers: vine.record(vine.any().nullable().optional()),
  })
)
const sessionValidator = vine.compile(
  vine.object({ schema_hash: vine.string().regex(/^[a-f0-9]{64}$/) })
)

export default class FormResponsesController {
  private async user(ctx: HttpContext): Promise<number | null> {
    if (!ctx.request.header('authorization')) return null
    try {
      await ctx.auth.authenticate()
      const claims = jwt.verify(
        (ctx.request.header('authorization') ?? '').replace(/^Bearer /, ''),
        env.get('APP_KEY'),
        { algorithms: ['HS256'], audience: 'kaderisasi-public' }
      )
      if (typeof claims !== 'object' || claims.userId !== ctx.auth.user?.id)
        throw new Error('UNAUTHORIZED')
      return ctx.auth.getUserOrFail().id
    } catch {
      throw new FormRequestError(401, 'UNAUTHORIZED')
    }
  }
  private fail(ctx: HttpContext, error: unknown): unknown {
    if (error instanceof FormRequestError)
      return ctx.response.status(error.status).send({ message: error.message })
    throw error
  }
  async session(ctx: HttpContext): Promise<unknown> {
    try {
      const input = await ctx.request.validateUsing(sessionValidator)
      const userId = await this.user(ctx)
      const form = await CustomForm.find(ctx.params.id)
      if (!form) throw new FormRequestError(404, 'CUSTOM_FORM_NOT_FOUND')
      if (schemaHash(form.formSchema) !== input.schema_hash)
        throw new FormRequestError(409, 'FORM_SCHEMA_CHANGED')
      return ctx.response.created({ data: await createFormSession(form, userId) })
    } catch (error) {
      return this.fail(ctx, error)
    }
  }
  async submit(ctx: HttpContext): Promise<unknown> {
    try {
      const input = await ctx.request.validateUsing(submissionValidator)
      const result = await submitStandalone(
        Number(ctx.params.id),
        input.session_token,
        await this.user(ctx),
        input.answers
      )
      return ctx.response.created({ message: 'FORM_SUBMITTED', data: result })
    } catch (error) {
      return this.fail(ctx, error)
    }
  }
  async upload(ctx: HttpContext): Promise<unknown> {
    try {
      const userId = await this.user(ctx)
      const file = ctx.request.file('file', {
        size: '10mb',
        extnames: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      })
      if (!file?.isValid || !file.tmpPath) throw new FormRequestError(422, 'INVALID_FILE')
      const result = await uploadFormAttachment(
        {
          formId: Number(ctx.params.id),
          userId,
          token: ctx.request.header('x-form-session') ?? '',
          fieldKey: String(ctx.params.key),
          uploadId: ctx.request.header('x-form-upload') ?? randomUUID(),
          path: file.tmpPath,
          originalName: file.clientName,
        },
        formUploadDependencies((error, storageKey) =>
          ctx.logger.error({ err: error, storageKey }, 'Form upload rollback cleanup failed')
        )
      )
      return ctx.response.created({ data: result })
    } catch (error) {
      return this.fail(ctx, error)
    }
  }
  async removeUpload(ctx: HttpContext): Promise<unknown> {
    try {
      const userId = await this.user(ctx)
      await db.transaction(async (trx) => {
        const form = await CustomForm.query({ client: trx })
          .where('id', ctx.params.id)
          .forShare()
          .first()
        if (!form) throw new FormRequestError(404, 'CUSTOM_FORM_NOT_FOUND')
        const session = await lockFormSession(
          trx,
          form,
          ctx.request.header('x-form-session') ?? '',
          userId
        )
        const file = await trx
          .from('custom_form_attachments')
          .where('id', ctx.params.attachmentId)
          .where('session_id', session.id)
          .whereNull('claimed_at')
          .forUpdate()
          .first()
        if (!file) throw new FormRequestError(404, 'ATTACHMENT_NOT_FOUND')
        await minioClient.send(
          new DeleteObjectCommand({ Bucket: env.get('DRIVE_BUCKET'), Key: file.storage_key })
        )
        await trx.from('custom_form_attachments').where('id', file.id).delete()
      })
      return ctx.response.ok({ message: 'FILE_REMOVED' })
    } catch (error) {
      return this.fail(ctx, error)
    }
  }
}
