import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Province from '#models/province'

export default class City extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare provinceId: number

  @belongsTo(() => Province, {
    foreignKey: 'provinceId',
  })
  declare province: BelongsTo<typeof Province>

  @column()
  declare name: string
}
