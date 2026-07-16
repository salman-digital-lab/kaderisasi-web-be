import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type CertificateTemplateLifecycle = 'draft' | 'published' | 'archived'

export type TemplateData = {
  backgroundUrl: string | null
  elements: Array<{
    id: string
    type: 'static-text' | 'variable-text' | 'image' | 'qr-code' | 'signature'
    name?: string
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
    verticalAlign?: 'top' | 'middle' | 'bottom'
    fontWeight?: 'normal' | 'bold'
    fontStyle?: 'normal' | 'italic'
    textDecoration?: 'none' | 'underline'
    lineHeight?: number
    letterSpacing?: number
    imageUrl?: string
    opacity?: number
    rotation?: number
    borderRadius?: number
    objectFit?: 'contain' | 'cover' | 'fill'
    visible?: boolean
    locked?: boolean
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

  @column()
  declare lifecycleStatus: CertificateTemplateLifecycle

  @column()
  declare version: number

  @column()
  declare backgroundAssetVersion: number

  @column.dateTime()
  declare publishedAt: DateTime | null

  @column.dateTime()
  declare archivedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
