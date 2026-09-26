import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import CustomForm from '#models/custom_form'
import Activity from '#models/activity'
import Club from '#models/club'
import { isActivityRegistrationOpen } from '#services/activity_registration_service'
import { isClubRegistrationOpen } from '#services/club_service'
import { validateCustomFormSubmission } from '#services/custom_form_submission_service'
import { validFileSettings } from '#services/form_file_service'
import type { FormFileSettings } from '#services/form_file_service'

export interface UploadField {
  key: string
  label: string
  type: string
  required: boolean
  hidden?: boolean
  disabled?: boolean
  file?: FormFileSettings
}
export interface UploadSchema {
  settings?: { accessMode?: 'public' | 'members' }
  fields: { id?: string; section_name: string; fields: UploadField[] }[]
}
export interface FormSession {
  id: string
  form_id: number
  user_id: number | null
  schema_hash: string
  expires_at: Date
  completed_at: Date | null
}
export class FormRequestError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex')
export function schemaHash(schema: object): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, stable(item)])
      )
    return value
  }
  return tokenHash(JSON.stringify(stable(schema)))
}
export async function requireOpenForm(
  form: CustomForm,
  userId: number | null,
  trx?: TransactionClientContract
): Promise<void> {
  if (!form.isActive) throw new FormRequestError(409, 'FORM_CLOSED')
  const schema = form.formSchema as UploadSchema
  if (form.featureType === 'independent_form') {
    if (schema.settings?.accessMode !== 'public' && !userId)
      throw new FormRequestError(401, 'LOGIN_REQUIRED')
  } else if (form.featureType === 'activity_registration') {
    const activity = await Activity.query({ client: trx })
      .where('id', form.featureId ?? 0)
      .first()
    if (!activity || !isActivityRegistrationOpen(activity))
      throw new FormRequestError(409, 'REGISTRATION_CLOSED')
    if (
      !userId &&
      (activity.activityType !== 1 || !activity.additionalConfig?.allow_guest_registration)
    )
      throw new FormRequestError(403, 'GUEST_REGISTRATION_NOT_ALLOWED')
  } else if (form.featureType === 'club_registration') {
    if (!userId) throw new FormRequestError(401, 'LOGIN_REQUIRED')
    const club = await Club.query({ client: trx })
      .where('id', form.featureId ?? 0)
      .first()
    if (!club || !isClubRegistrationOpen(club))
      throw new FormRequestError(409, 'REGISTRATION_CLOSED')
  } else throw new FormRequestError(404, 'CUSTOM_FORM_NOT_FOUND')
}
export async function createFormSession(
  form: CustomForm,
  userId: number | null
): Promise<{ token: string; schema_hash: string }> {
  await requireOpenForm(form, userId)
  const token = randomBytes(32).toString('hex')
  const hash = schemaHash(form.formSchema)
  await db.table('custom_form_sessions').insert({
    id: randomUUID(),
    form_id: form.id,
    user_id: userId,
    token_hash: tokenHash(token),
    schema_hash: hash,
    expires_at: new Date(Date.now() + 86_400_000),
  })
  return { token, schema_hash: hash }
}
export async function lockFormSession(
  trx: TransactionClientContract,
  form: CustomForm,
  token: string,
  userId: number | null
): Promise<FormSession> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new FormRequestError(422, 'INVALID_FORM_SESSION')
  const session = (await trx
    .from('custom_form_sessions')
    .where('token_hash', tokenHash(token))
    .where('form_id', form.id)
    .forUpdate()
    .first()) as FormSession | undefined
  if (
    !session ||
    session.user_id !== userId ||
    new Date(session.expires_at).getTime() <= Date.now()
  )
    throw new FormRequestError(422, 'INVALID_FORM_SESSION')
  return session
}

export async function readFormSession(
  form: CustomForm,
  token: string,
  userId: number | null
): Promise<FormSession> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new FormRequestError(422, 'INVALID_FORM_SESSION')
  const session = (await db
    .from('custom_form_sessions')
    .where('token_hash', tokenHash(token))
    .where('form_id', form.id)
    .first()) as FormSession | undefined
  if (
    !session ||
    session.user_id !== userId ||
    new Date(session.expires_at).getTime() <= Date.now()
  )
    throw new FormRequestError(422, 'INVALID_FORM_SESSION')
  return session
}
export async function claimFormAttachments(
  trx: TransactionClientContract,
  form: CustomForm,
  token: string | undefined,
  userId: number | null,
  answers: Record<string, unknown>,
  previousAnswers?: Record<string, unknown>
): Promise<void> {
  const fields = (form.formSchema as UploadSchema).fields
    .flatMap((section) => section.fields)
    .filter((field) => field.type === 'file' && !field.hidden && !field.disabled)
  if (!fields.length && !token) return
  if (!token && !previousAnswers) throw new FormRequestError(422, 'INVALID_FORM_SESSION')
  const session = token ? await lockFormSession(trx, form, token, userId) : undefined
  if (session?.completed_at) throw new FormRequestError(409, 'FORM_SESSION_COMPLETED')
  if (session && session.schema_hash !== schemaHash(form.formSchema))
    throw new FormRequestError(409, 'FORM_SCHEMA_CHANGED')
  for (const field of fields) {
    const ids = answers[field.key]
    if (ids === undefined) continue
    if (
      !validFileSettings(field.file) ||
      !Array.isArray(ids) ||
      ids.length > field.file.maxFiles ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
    )
      throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
    const previous = previousAnswers?.[field.key]
    const retainedIds = ids.filter((id) => Array.isArray(previous) && previous.includes(id))
    if (retainedIds.length) {
      const retained = await trx
        .from('custom_form_attachments as a')
        .join('custom_form_sessions as s', 's.id', 'a.session_id')
        .where('s.form_id', form.id)
        .where('s.user_id', userId!)
        .where('a.field_key', field.key)
        .whereIn('a.id', retainedIds)
        .whereNotNull('a.claimed_at')
        .select('a.id')
      if (retained.length !== retainedIds.length)
        throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
    }
    const newIds = ids.filter((id) => !Array.isArray(previous) || !previous.includes(id))
    if (!newIds.length) continue
    if (!session) throw new FormRequestError(422, 'INVALID_FORM_SESSION')
    const files = await trx
      .from('custom_form_attachments')
      .where('session_id', session.id)
      .where('field_key', field.key)
      .whereIn('id', newIds)
      .whereNull('claimed_at')
      .forUpdate()
    if (
      files.length !== newIds.length ||
      files.some(
        (file) =>
          file.source_size_bytes > field.file!.maxSizeMB * 1024 * 1024 ||
          (field.file!.accept === 'pdf' && file.mime_type !== 'application/pdf') ||
          (field.file!.accept === 'image' && file.mime_type !== 'image/webp')
      )
    )
      throw new FormRequestError(422, 'INVALID_FORM_ATTACHMENT')
    await trx
      .from('custom_form_attachments')
      .whereIn('id', newIds)
      .update({ claimed_at: new Date() })
  }
  if (session)
    await trx
      .from('custom_form_sessions')
      .where('id', session.id)
      .update({ completed_at: new Date() })
}
export async function submitStandalone(
  formId: number,
  token: string,
  userId: number | null,
  answers: Record<string, unknown>
): Promise<{ id: string }> {
  return db.transaction(async (trx) => {
    const form = await CustomForm.query({ client: trx })
      .where('id', formId)
      .where('feature_type', 'independent_form')
      .forUpdate()
      .first()
    if (!form) throw new FormRequestError(404, 'CUSTOM_FORM_NOT_FOUND')
    const session = await lockFormSession(trx, form, token, userId)
    const existing = await trx.from('custom_form_responses').where('session_id', session.id).first()
    if (existing) return { id: existing.id }
    await requireOpenForm(form, userId, trx)
    if (session.schema_hash !== schemaHash(form.formSchema))
      throw new FormRequestError(409, 'FORM_SCHEMA_CHANGED')
    // Identity on standalone forms is response data, never a profile update.
    const schema = form.formSchema as UploadSchema
    const validationSchema = {
      ...schema,
      fields: schema.fields.map((section) =>
        section.section_name === 'profile_data'
          ? { ...section, section_name: 'Data diri' }
          : section
      ),
    }
    const submission = validateCustomFormSubmission(validationSchema, answers)
    if (!submission.valid)
      throw new FormRequestError(422, submission.errors[0]?.message ?? 'INVALID_FORM_SUBMISSION')
    await claimFormAttachments(trx, form, token, userId, submission.data)
    const id = randomUUID()
    await trx.table('custom_form_responses').insert({
      id,
      form_id: form.id,
      session_id: session.id,
      user_id: userId,
      form_snapshot: JSON.stringify({ title: form.formName, schema: form.formSchema }),
      answers: JSON.stringify(submission.data),
    })
    return { id }
  })
}
