import type { HttpContext } from '@adonisjs/core/http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import vine from '@vinejs/vine'
import jwt from 'jsonwebtoken'
import db from '@adonisjs/lucid/services/db'
import CustomForm from '#models/custom_form'
import { minioClient } from '#config/drive'
import env from '#start/env'
import { processFormFile, validFileSettings } from '#services/form_file_service'
import {
  createFormSession,
  FormRequestError,
  lockFormSession,
  requireOpenForm,
  schemaHash,
  submitStandalone,
} from '#services/form_session_service'
import type { UploadSchema } from '#services/form_session_service'

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
    let storedKey: string | undefined
    let attachmentId: string | undefined
    try {
      const userId = await this.user(ctx)
      const upload = ctx.request.file('file', {
        size: '10mb',
        extnames: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      })
      if (!upload?.isValid || !upload.tmpPath) throw new FormRequestError(422, 'INVALID_FILE')
      const token = ctx.request.header('x-form-session') ?? ''
      const key = String(ctx.params.key)
      const uploadID = ctx.request.header('x-form-upload') ?? randomUUID()
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(uploadID))
        throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
      const result = await db.transaction(async (trx) => {
        const form = await CustomForm.query({ client: trx })
          .where('id', ctx.params.id)
          .forUpdate()
          .first()
        if (!form) throw new FormRequestError(404, 'CUSTOM_FORM_NOT_FOUND')
        await requireOpenForm(form, userId)
        const session = await lockFormSession(trx, form, token, userId)
        if (session.completed_at) throw new FormRequestError(409, 'FORM_SESSION_COMPLETED')
        if (session.schema_hash !== schemaHash(form.formSchema))
          throw new FormRequestError(409, 'FORM_SCHEMA_CHANGED')
        const field = (form.formSchema as UploadSchema).fields
          .flatMap((section) => section.fields)
          .find(
            (item) => item.key === key && item.type === 'file' && !item.hidden && !item.disabled
          )
        if (!field || !validFileSettings(field.file))
          throw new FormRequestError(422, 'INVALID_FILE_FIELD')
        const previous = await trx.from('custom_form_attachments').where('id', uploadID).first()
        if (previous) {
          if (previous.session_id !== session.id || previous.field_key !== key)
            throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
          return {
            id: previous.id,
            name: previous.original_name,
            download_name: previous.download_name,
            mime_type: previous.mime_type,
            size: previous.size_bytes,
            width: previous.width,
            height: previous.height,
          }
        }
        const [{ total }] = await trx
          .from('custom_form_attachments')
          .where('session_id', session.id)
          .where('field_key', key)
          .count('* as total')
        if (Number(total) >= field.file.maxFiles) throw new FormRequestError(422, 'TOO_MANY_FILES')
        const source = await readFile(upload.tmpPath!)
        let processed
        try {
          processed = await processFormFile(source, field.file)
        } catch (error) {
          throw new FormRequestError(422, error instanceof Error ? error.message : 'INVALID_FILE')
        }
        const id = uploadID
        const storageKey = `custom-forms/${form.id}/${id}.${processed.extension}`
        storedKey = storageKey
        attachmentId = id
        const originalName =
          Array.from(basename(upload.clientName))
            .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
            .join('')
            .slice(0, 200) || 'berkas'
        const downloadName = originalName.replace(/\.[^.]+$/, '') + '.' + processed.extension
        await trx.table('custom_form_attachments').insert({
          id,
          session_id: session.id,
          field_key: key,
          storage_key: storageKey,
          original_name: originalName,
          download_name: downloadName,
          mime_type: processed.mimeType,
          size_bytes: processed.contents.length,
          source_size_bytes: source.length,
          width: processed.width,
          height: processed.height,
        })
        try {
          await minioClient.send(
            new PutObjectCommand({
              Bucket: env.get('DRIVE_BUCKET'),
              Key: storageKey,
              Body: processed.contents,
              ContentType: processed.mimeType,
              CacheControl: 'private, no-store',
              ACL: 'private',
            })
          )
        } catch {
          await minioClient
            .send(new DeleteObjectCommand({ Bucket: env.get('DRIVE_BUCKET'), Key: storageKey }))
            .catch(() => undefined)
          throw new FormRequestError(503, 'UPLOAD_FAILED')
        }
        return {
          id,
          name: originalName,
          download_name: downloadName,
          mime_type: processed.mimeType,
          size: processed.contents.length,
          width: processed.width,
          height: processed.height,
        }
      })
      return ctx.response.created({ data: result })
    } catch (error) {
      if (storedKey && attachmentId) {
        try {
          const recorded = await db
            .from('custom_form_attachments')
            .where('id', attachmentId)
            .first()
          if (!recorded)
            await minioClient.send(
              new DeleteObjectCommand({ Bucket: env.get('DRIVE_BUCKET'), Key: storedKey })
            )
        } catch (cleanupError) {
          ctx.logger.error(
            { err: cleanupError, storageKey: storedKey },
            'Form upload rollback cleanup failed'
          )
        }
      }
      return this.fail(ctx, error)
    }
  }
  async removeUpload(ctx: HttpContext): Promise<unknown> {
    try {
      const userId = await this.user(ctx)
      await db.transaction(async (trx) => {
        const form = await CustomForm.query({ client: trx })
          .where('id', ctx.params.id)
          .forUpdate()
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
