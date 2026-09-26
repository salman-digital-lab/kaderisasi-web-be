import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import CustomForm from '#models/custom_form'
import { minioClient } from '#config/drive'
import env from '#start/env'
import { processFormFile, validFileSettings } from '#services/form_file_service'
import type { FormFileSettings, ProcessedFormFile } from '#services/form_file_service'
import {
  FormRequestError,
  lockFormSession,
  readFormSession,
  requireOpenForm,
  schemaHash,
} from '#services/form_session_service'
import type { UploadSchema } from '#services/form_session_service'

export type UploadInput = {
  formId: number
  userId: number | null
  token: string
  fieldKey: string
  uploadId: string
  path: string
  originalName: string
}
type Attachment = {
  id: string
  session_id: string
  field_key: string
  storage_key: string
  original_name: string
  download_name: string
  mime_type: string
  size_bytes: number
  source_size_bytes: number
  width: number | null
  height: number | null
}
export type UploadResult = {
  id: string
  name: string
  download_name: string
  mime_type: string
  size: number
  width: number | null
  height: number | null
}
export type UploadDependencies = {
  read: (path: string) => Promise<Buffer>
  process: (source: Buffer, settings: FormFileSettings) => Promise<ProcessedFormFile>
  put: (key: string, file: ProcessedFormFile) => Promise<void>
  remove: (key: string) => Promise<void>
  cleanupError: (error: unknown, key: string) => void
}
const present = (row: Attachment): UploadResult => ({
  id: row.id,
  name: row.original_name,
  download_name: row.download_name,
  mime_type: row.mime_type,
  size: row.size_bytes,
  width: row.width,
  height: row.height,
})

async function validate(
  input: UploadInput,
  trx?: TransactionClientContract
): Promise<{
  sessionId: string
  settings: FormFileSettings
  previous?: Attachment
}> {
  const query = CustomForm.query({ client: trx }).where('id', input.formId)
  if (trx) query.forShare()
  const form = await query.first()
  if (!form) throw new FormRequestError(404, 'CUSTOM_FORM_NOT_FOUND')
  await requireOpenForm(form, input.userId, trx)
  const session = trx
    ? await lockFormSession(trx, form, input.token, input.userId)
    : await readFormSession(form, input.token, input.userId)
  if (session.completed_at) throw new FormRequestError(409, 'FORM_SESSION_COMPLETED')
  if (session.schema_hash !== schemaHash(form.formSchema))
    throw new FormRequestError(409, 'FORM_SCHEMA_CHANGED')
  const field = (form.formSchema as UploadSchema).fields
    .flatMap((section) => section.fields)
    .find(
      (item) =>
        item.key === input.fieldKey && item.type === 'file' && !item.hidden && !item.disabled
    )
  if (!field || !validFileSettings(field.file))
    throw new FormRequestError(422, 'INVALID_FILE_FIELD')
  const client = trx ?? db.connection()
  const previous = (await client
    .from('custom_form_attachments')
    .where('id', input.uploadId)
    .first()) as Attachment | undefined
  if (previous) {
    if (previous.session_id !== session.id || previous.field_key !== input.fieldKey)
      throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
    return { sessionId: session.id, settings: field.file, previous }
  }
  const [{ total }] = await client
    .from('custom_form_attachments')
    .where('session_id', session.id)
    .where('field_key', input.fieldKey)
    .count('* as total')
  if (Number(total) >= field.file.maxFiles) throw new FormRequestError(422, 'TOO_MANY_FILES')
  return { sessionId: session.id, settings: field.file }
}

export async function uploadFormAttachment(
  input: UploadInput,
  deps: UploadDependencies
): Promise<UploadResult> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.uploadId))
    throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
  const preflight = await validate(input)
  if (preflight.previous) return present(preflight.previous)
  const source = await deps.read(input.path)
  let processed: ProcessedFormFile
  try {
    processed = await deps.process(source, preflight.settings)
  } catch (error) {
    throw new FormRequestError(422, error instanceof Error ? error.message : 'INVALID_FILE')
  }
  const key = `custom-forms/${input.formId}/${randomUUID()}.${processed.extension}`
  const originalName =
    Array.from(basename(input.originalName))
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .slice(0, 200) || 'berkas'
  let published = false
  try {
    try {
      await deps.put(key, processed)
    } catch {
      throw new FormRequestError(503, 'UPLOAD_FAILED')
    }
    const result = await db.transaction(async (trx) => {
      const checked = await validate(input, trx)
      if (checked.previous) return checked.previous
      const row: Attachment = {
        id: input.uploadId,
        session_id: checked.sessionId,
        field_key: input.fieldKey,
        storage_key: key,
        original_name: originalName,
        download_name: originalName.replace(/\.[^.]+$/, '') + '.' + processed.extension,
        mime_type: processed.mimeType,
        size_bytes: processed.contents.length,
        source_size_bytes: source.length,
        width: processed.width,
        height: processed.height,
      }
      const inserted = (await trx
        .knexQuery()
        .table('custom_form_attachments')
        .insert(row)
        .onConflict('id')
        .ignore()
        .returning('*')) as Attachment[]
      if (inserted[0]) return inserted[0]
      const winner = (await trx
        .from('custom_form_attachments')
        .where('id', input.uploadId)
        .first()) as Attachment | undefined
      if (!winner || winner.session_id !== checked.sessionId || winner.field_key !== input.fieldKey)
        throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
      return winner
    })
    published = result.storage_key === key
    return present(result)
  } finally {
    if (!published) {
      try {
        // Resolve any uncertain finalization before deciding whether this attempt owns an orphan.
        const referenced = await db.transaction(async (trx) => {
          await trx
            .from('custom_form_sessions')
            .where('id', preflight.sessionId)
            .forUpdate()
            .first()
          return Boolean(
            await trx.from('custom_form_attachments').where('storage_key', key).first()
          )
        })
        if (!referenced) await deps.remove(key)
      } catch (error) {
        deps.cleanupError(error, key)
      }
    }
  }
}

export function formUploadDependencies(
  cleanupError: UploadDependencies['cleanupError']
): UploadDependencies {
  return {
    read: readFile,
    process: processFormFile,
    put: async (key, file) => {
      await minioClient.send(
        new PutObjectCommand({
          Bucket: env.get('DRIVE_BUCKET'),
          Key: key,
          Body: file.contents,
          ContentType: file.mimeType,
          CacheControl: 'private, no-store',
          ACL: 'private',
        })
      )
    },
    remove: async (key) => {
      await minioClient.send(new DeleteObjectCommand({ Bucket: env.get('DRIVE_BUCKET'), Key: key }))
    },
    cleanupError,
  }
}
