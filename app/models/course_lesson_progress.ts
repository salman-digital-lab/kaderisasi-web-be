import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CourseLesson from '#models/course_lesson'
import PublicUser from '#models/public_user'

export default class CourseLessonProgress extends BaseModel {
  static table = 'course_lesson_progress'
  @column({ isPrimary: true }) declare id: number
  @column() declare userId: number
  @column() declare lessonId: number
  @column.dateTime() declare firstVisitedAt: DateTime
  @column.dateTime() declare lastVisitedAt: DateTime
  @column.dateTime() declare completedAt: DateTime | null
  @belongsTo(() => CourseLesson, { foreignKey: 'lessonId' }) declare lesson: BelongsTo<
    typeof CourseLesson
  >
  @belongsTo(() => PublicUser, { foreignKey: 'userId' }) declare user: BelongsTo<typeof PublicUser>
}
