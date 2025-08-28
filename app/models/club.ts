import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import ClubRegistration from '#models/club_registration'
import type { HasMany } from '@adonisjs/lucid/types/relations'

export type MediaItem = {
  media_url: string
  media_type: 'image' | 'video'
  video_source?: 'youtube' // Only present when media_type is 'video'
}

export type MediaStructure = {
  items: MediaItem[]
}

export type RegistrationInfoStructure = {
  registration_info: string
  after_registration_info: string
}

export default class Club extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string

  @column()
  declare shortDescription: string | null

  @column()
  declare logo: string

  @column()
  declare media: MediaStructure

  @column()
  declare registrationInfo: RegistrationInfoStructure

  @hasMany(() => ClubRegistration, {
    foreignKey: 'clubId',
  })
  declare registrations: HasMany<typeof ClubRegistration>

  @column.date()
  declare startPeriod: DateTime | null

  @column.date()
  declare endPeriod: DateTime | null

  @column()
  declare isShow: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
