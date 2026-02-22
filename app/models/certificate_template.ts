import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

type TemplateData = {
  backgroundUrl: string | null
  elements: Array<{
    id: string
    type: 'static-text' | 'variable-text' | 'image' | 'qr-code' | 'signature'
    x: number
    y: number
    width: number
    height: number
    content?: string
    variable?: string
    fontSize?: number
    fontFamily?: string
    color?: string
    textAlign?: 'left' | 'center' | 'right'
    imageUrl?: string
  }>
  canvasWidth: number
  canvasHeight: number
}

export default class CertificateTemplate extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare backgroundImage: string | null

  @column()
  declare templateData: TemplateData

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
