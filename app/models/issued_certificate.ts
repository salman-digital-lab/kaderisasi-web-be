import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import Activity from '#models/activity'
import ActivityRegistration from '#models/activity_registration'
import AdminUser from '#models/admin_user'
import CertificateTemplate from '#models/certificate_template'
import PublicUser from '#models/public_user'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type {
  CertificateParticipantData,
  CertificateTemplateData,
} from '#services/certificate_service'

export default class IssuedCertificate extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare certificateCode: string

  @column()
  declare registrationId: number

  @belongsTo(() => ActivityRegistration, {
    foreignKey: 'registrationId',
  })
  declare registration: BelongsTo<typeof ActivityRegistration>

  @column()
  declare activityId: number

  @belongsTo(() => Activity, {
    foreignKey: 'activityId',
  })
  declare activity: BelongsTo<typeof Activity>

  @column()
  declare userId: number | null

  @belongsTo(() => PublicUser, {
    foreignKey: 'userId',
  })
  declare publicUser: BelongsTo<typeof PublicUser>

  @column()
  declare templateId: number

  @belongsTo(() => CertificateTemplate, {
    foreignKey: 'templateId',
  })
  declare template: BelongsTo<typeof CertificateTemplate>

  @column()
  declare templateSnapshot: CertificateTemplateData

  @column()
  declare participantSnapshot: CertificateParticipantData

  @column()
  declare issuedBy: number | null

  @belongsTo(() => AdminUser, {
    foreignKey: 'issuedBy',
  })
  declare issuer: BelongsTo<typeof AdminUser>

  @column.dateTime()
  declare issuedAt: DateTime

  @column.dateTime()
  declare revokedAt: DateTime | null

  @column()
  declare revokedReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
