import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type MediaItem = {
  media_url: string
  media_type: 'image' | 'video'
  video_source?: 'youtube' // Only present when media_type is 'video'
}

export type MediaStructure = {
  items: MediaItem[]
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
