import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'

type Notification = {
  id: number
  title: string
  body: string
  link_label: string | null
  link_url: string | null
  published_at: string
  read_at: Date | null
}
type Cursor = { id: number; time: string }
const failure = (status: number, message: string): Exception => new Exception(message, { status })
const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value))
const publishedTime = `to_char(a.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS published_at`

export default class NotificationService {
  private query(userId: number) {
    return db
      .from('announcement_recipients as r')
      .join('announcements as a', 'a.id', 'r.announcement_id')
      .where('r.public_user_id', userId)
      .where('a.state', 'published')
  }

  async clock(): Promise<string> {
    const result = await db.rawQuery(
      `WITH publication_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(1790045423)) SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff FROM publication_lock`
    )
    return result.rows[0].cutoff
  }

  async list(
    userId: number,
    cursor?: string,
    unread = false
  ): Promise<{ items: Notification[]; next_cursor: string; cutoff: string }> {
    let before: Cursor | undefined
    if (cursor) {
      try {
        before = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Cursor
        if (
          !Number.isSafeInteger(before.id) ||
          before.id <= 0 ||
          before.id > 2147483647 ||
          !validTimestamp(before.time)
        )
          throw new Error('cursor')
      } catch {
        throw failure(422, 'INVALID_CURSOR')
      }
    }
    const cutoff = await this.clock()
    const query = this.query(userId)
    if (unread) query.whereNull('r.read_at')
    if (before)
      query.whereRaw('(a.published_at, r.id) < (?::timestamptz, ?::integer)', [
        before.time,
        before.id,
      ])
    // Select timestamps as text to preserve PostgreSQL microseconds in cursors.
    const rows = (await query
      .select(
        'r.id',
        'a.title',
        'a.body',
        'a.link_label',
        'a.link_url',
        db.raw(publishedTime),
        'r.read_at'
      )
      .orderBy('a.published_at', 'desc')
      .orderBy('r.id', 'desc')
      .limit(21)) as Notification[]
    const more = rows.length > 20
    const items = rows.slice(0, 20)
    const last = items.at(-1)
    const next =
      more && last
        ? Buffer.from(JSON.stringify({ id: last.id, time: last.published_at })).toString(
            'base64url'
          )
        : ''
    return { items, next_cursor: next, cutoff }
  }

  async count(userId: number): Promise<{ unread: number }> {
    const row = await this.query(userId).whereNull('r.read_at').count('* as count').first()
    return { unread: Number(row.count) }
  }

  async show(userId: number, id: number): Promise<Notification> {
    const row = (await this.query(userId)
      .where('r.id', id)
      .select(
        'r.id',
        'a.title',
        'a.body',
        'a.link_label',
        'a.link_url',
        db.raw(publishedTime),
        'r.read_at'
      )
      .first()) as Notification | null
    if (!row) throw failure(404, 'NOTIFICATION_NOT_FOUND')
    return row
  }

  async read(userId: number, id: number): Promise<Notification> {
    await db.rawQuery(
      "UPDATE announcement_recipients r SET read_at=COALESCE(read_at,clock_timestamp()) FROM announcements a WHERE a.id=r.announcement_id AND a.state='published' AND r.id=? AND r.public_user_id=?",
      [id, userId]
    )
    return this.show(userId, id)
  }

  async readAll(userId: number, cutoff: string): Promise<void> {
    const now = await this.clock()
    if (!validTimestamp(cutoff) || Date.parse(cutoff) > Date.parse(now))
      throw failure(422, 'INVALID_CUTOFF')
    await db.rawQuery(
      "UPDATE announcement_recipients r SET read_at=clock_timestamp() FROM announcements a WHERE a.id=r.announcement_id AND a.state='published' AND r.public_user_id=? AND r.read_at IS NULL AND a.published_at<=?::timestamptz",
      [userId, cutoff]
    )
  }
}
