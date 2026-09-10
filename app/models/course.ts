import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import CourseLesson from '#models/course_lesson'

export default class Course extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @column() declare title: string
  @column() declare summary: string
  @column() declare description: string
  @column() declare minimumLevel: number
  @column() declare status: 'draft' | 'published' | 'archived'
  @column.dateTime() declare createdAt: DateTime
  @column.dateTime() declare updatedAt: DateTime
  @hasMany(() => CourseLesson) declare lessons: HasMany<typeof CourseLesson>
}
