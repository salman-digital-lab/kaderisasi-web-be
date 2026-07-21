import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  isClubRegistrationOpen,
  isClubRegistrationUniqueViolation,
  normalizeClubListQuery,
  serializePublicClubMedia,
  serializePublicClubLeadershipRole,
} from '#services/club_service'

test.group('Club service', () => {
  test('normalizes list pagination, search, and club type filters', ({ assert }) => {
    const normalized = normalizeClubListQuery({
      page: '0',
      per_page: '999',
      search: `  ${'a'.repeat(120)}  `,
      club_type: 'INVALID',
    })

    assert.equal(normalized.page, 1)
    assert.equal(normalized.perPage, 50)
    assert.lengthOf(normalized.search, 100)
    assert.isUndefined(normalized.clubType)
    assert.equal(normalizeClubListQuery({ club_type: 'UNIT' }).clubType, 'UNIT')
    assert.equal(
      normalizeClubListQuery({ club_type: 'CLUB_KEPROFESIAN' }).clubType,
      'CLUB_KEPROFESIAN'
    )
    assert.equal(normalizeClubListQuery({ club_type: 'CLUB_BAHASA' }).clubType, 'CLUB_BAHASA')
    assert.equal(
      normalizeClubListQuery({ club_type: 'AVISMAN_REGIONAL' }).clubType,
      'AVISMAN_REGIONAL'
    )
  })

  test('treats the registration end date as inclusive and respects visibility', ({ assert }) => {
    const today = DateTime.fromISO('2026-07-16')
    const openClub = {
      isShow: true,
      isRegistrationOpen: true,
      registrationEndDate: DateTime.fromISO('2026-07-16'),
    }

    assert.isTrue(isClubRegistrationOpen(openClub, today))
    assert.isFalse(
      isClubRegistrationOpen(
        { ...openClub, registrationEndDate: DateTime.fromISO('2026-07-15') },
        today
      )
    )
    assert.isFalse(isClubRegistrationOpen({ ...openClub, isShow: false }, today))
    assert.isFalse(isClubRegistrationOpen({ ...openClub, isRegistrationOpen: false }, today))
    assert.isTrue(isClubRegistrationOpen({ ...openClub, registrationEndDate: null }, today))
  })

  test('serializes only explicitly public leadership member fields', ({ assert }) => {
    const leadership = {
      id: 3,
      clubRegistrationId: 7,
      roleName: 'Ketua',
      startDate: DateTime.fromISO('2026-01-01'),
      endDate: null,
      isPrimary: true,
      sortOrder: 1,
      createdAt: DateTime.fromISO('2026-01-01T00:00:00Z'),
      updatedAt: DateTime.fromISO('2026-02-01T00:00:00Z'),
      registration: {
        id: 7,
        member: {
          id: 11,
          email: 'private@example.com',
          memberId: '00000011',
          profile: {
            name: 'Public Name',
            picture: 'profile.jpg',
            personal_id: 'private-id',
            whatsapp: '08123456789',
          },
        },
      },
    }

    const serialized = serializePublicClubLeadershipRole(leadership)
    const payload = JSON.stringify(serialized)

    assert.equal(serialized.role_name, 'Ketua')
    assert.deepEqual(serialized.registration.member.profile, {
      name: 'Public Name',
      picture: 'profile.jpg',
    })
    assert.notInclude(payload, 'private@example.com')
    assert.notInclude(payload, 'private-id')
    assert.notInclude(payload, '08123456789')
    assert.notInclude(payload, 'memberId')
  })

  test('recognizes direct and wrapped Club registration unique violations', ({ assert }) => {
    const violation = {
      code: '23505',
      constraint: 'club_registrations_club_id_member_id_unique',
    }

    assert.isTrue(isClubRegistrationUniqueViolation(violation))
    assert.isTrue(isClubRegistrationUniqueViolation({ cause: violation }))
    assert.isFalse(
      isClubRegistrationUniqueViolation({
        code: '23505',
        constraint: 'public_users_email_unique',
      })
    )
    assert.isFalse(isClubRegistrationUniqueViolation(new Error('connection failed')))
  })

  test('exposes only upload-backed images and YouTube embed media', ({ assert }) => {
    assert.deepEqual(
      serializePublicClubMedia({
        items: [
          { media_url: 'club/club_media_1.webp', media_type: 'image' },
          {
            media_url: 'https://www.youtube.com/embed/abc_DEF-123',
            media_type: 'video',
            video_source: 'youtube',
          },
          { media_url: 'javascript:alert(1)', media_type: 'video' },
          { media_url: '../../secret.png', media_type: 'image' },
          { media_url: 'https://evil.example/embed/abc', media_type: 'video' },
        ],
      }),
      {
        items: [
          { media_url: 'club/club_media_1.webp', media_type: 'image' },
          {
            media_url: 'https://www.youtube.com/embed/abc_DEF-123',
            media_type: 'video',
            video_source: 'youtube',
          },
        ],
      }
    )
  })
})
