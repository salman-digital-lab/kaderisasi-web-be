import { DateTime } from 'luxon'
import type { ClubType, MediaItem, MediaStructure } from '#models/club'

const DEFAULT_PAGE = 1
const DEFAULT_PER_PAGE = 10
const MAX_PER_PAGE = 50
const MAX_SEARCH_LENGTH = 100

type ClubRegistrationAvailability = {
  isShow: boolean
  isRegistrationOpen: boolean
  registrationEndDate: DateTime | null
}

type ClubLeadershipSource = {
  id: number
  clubRegistrationId: number
  roleName: string
  startDate: DateTime | null
  endDate: DateTime | null
  isPrimary: boolean
  sortOrder: number
  createdAt: DateTime
  updatedAt: DateTime
  registration: {
    id: number
    member: {
      id: number
      profile?: {
        name: string
        picture?: string | null
      } | null
    }
  }
}

export type ClubListQuery = {
  page: number
  perPage: number
  search: string
  clubType?: ClubType
}

export type PublicClubLeadershipRole = {
  id: number
  club_registration_id: number
  role_name: string
  start_date: string | null
  end_date: string | null
  is_primary: boolean
  sort_order: number
  created_at: string
  updated_at: string
  registration: {
    id: number
    member: {
      id: number
      profile?: {
        name: string
        picture: string | null
      }
    }
  }
}

function normalizePositiveInteger(value: unknown, fallback: number, maximum?: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }

  return maximum === undefined ? parsed : Math.min(parsed, maximum)
}

export function normalizeClubListQuery(query: Record<string, unknown>): ClubListQuery {
  const rawSearch = typeof query.search === 'string' ? query.search.trim() : ''
  const rawClubType = query.club_type
  const clubType = rawClubType === 'UKM' || rawClubType === 'AVISMAN' ? rawClubType : undefined

  return {
    page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
    perPage: normalizePositiveInteger(query.per_page, DEFAULT_PER_PAGE, MAX_PER_PAGE),
    search: rawSearch.slice(0, MAX_SEARCH_LENGTH),
    clubType,
  }
}

/**
 * Registration deadlines are inclusive: a club stays open through the configured end date.
 * The visibility flag is part of registration eligibility so hidden clubs cannot accept entries.
 */
export function isClubRegistrationOpen(
  club: ClubRegistrationAvailability,
  now: DateTime = DateTime.local()
): boolean {
  if (!club.isShow || !club.isRegistrationOpen) {
    return false
  }

  if (!club.registrationEndDate) {
    return true
  }

  const registrationEndDate = club.registrationEndDate.toISODate()
  const currentDate = now.toISODate()

  return registrationEndDate !== null && currentDate !== null && registrationEndDate >= currentDate
}

export function serializePublicClubLeadershipRole(
  role: ClubLeadershipSource
): PublicClubLeadershipRole {
  const profile = role.registration.member.profile

  return {
    id: role.id,
    club_registration_id: role.clubRegistrationId,
    role_name: role.roleName,
    start_date: role.startDate?.toISODate() ?? null,
    end_date: role.endDate?.toISODate() ?? null,
    is_primary: role.isPrimary,
    sort_order: role.sortOrder,
    created_at: role.createdAt.toISO() ?? '',
    updated_at: role.updatedAt.toISO() ?? '',
    registration: {
      id: role.registration.id,
      member: {
        id: role.registration.member.id,
        ...(profile
          ? {
              profile: {
                name: profile.name,
                picture: profile.picture ?? null,
              },
            }
          : {}),
      },
    },
  }
}

export function isClubRegistrationUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const databaseError = error as {
    code?: unknown
    constraint?: unknown
    cause?: unknown
  }

  if (databaseError.code === '23505') {
    return (
      databaseError.constraint === undefined ||
      (typeof databaseError.constraint === 'string' &&
        databaseError.constraint.includes('club_registrations') &&
        databaseError.constraint.includes('club_id') &&
        databaseError.constraint.includes('member_id'))
    )
  }

  return databaseError.cause !== error && isClubRegistrationUniqueViolation(databaseError.cause)
}

function isSafeClubImageKey(value: string): boolean {
  return (
    value.startsWith('club/') &&
    !value.includes('..') &&
    /^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(value)
  )
}

function isSafeYoutubeEmbed(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.youtube.com' &&
      /^\/embed\/[a-zA-Z0-9_-]+$/.test(url.pathname) &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}

/** Allow only media shapes produced by the dedicated Club upload endpoints. */
export function serializePublicClubMedia(value: unknown): MediaStructure {
  if (typeof value !== 'object' || value === null || !('items' in value)) {
    return { items: [] }
  }

  const items = (value as { items?: unknown }).items
  if (!Array.isArray(items)) return { items: [] }

  return {
    items: items.flatMap((item): MediaItem[] => {
      if (typeof item !== 'object' || item === null) return []

      const candidate = item as Record<string, unknown>
      const mediaUrl = candidate.media_url
      if (typeof mediaUrl !== 'string') return []

      if (candidate.media_type === 'image' && isSafeClubImageKey(mediaUrl)) {
        return [{ media_url: mediaUrl, media_type: 'image' }]
      }

      if (
        candidate.media_type === 'video' &&
        candidate.video_source === 'youtube' &&
        isSafeYoutubeEmbed(mediaUrl)
      ) {
        return [{ media_url: mediaUrl, media_type: 'video', video_source: 'youtube' }]
      }

      return []
    }),
  }
}
