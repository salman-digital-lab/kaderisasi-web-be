import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { test } from '@japa/runner'
import sharp from 'sharp'
import db from '@adonisjs/lucid/services/db'
import Profile from '#models/profile'
import { profilePictureStorage, replaceProfilePicture } from '#services/profile_picture_service'
import type { ProfilePictureStorage } from '#services/profile_picture_service'
import env from '#start/env'
import { minioClient } from '#config/drive'

const schema = process.env.PROFILE_IMAGE_TEST_SCHEMA

test.group('Profile picture replacement', (group) => {
  group.setup(async () => {
    if (!schema) return
    const result = await db.rawQuery('SELECT current_schema() AS name')
    if (!schema.startsWith('profile_image_test_') || result.rows[0].name !== schema) {
      throw new Error('Owned test schema required')
    }
  })

  async function fixture(): Promise<{ profile: Profile; input: Buffer }> {
    const profile = await Profile.create({
      userId: Math.floor(Math.random() * 1_000_000_000),
      name: 'Synthetic image test',
      picture: `fixture-${randomUUID()}.jpg`,
    })
    const input = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: '#285080' },
    })
      .jpeg()
      .toBuffer()
    return { profile, input }
  }

  test('publishes valid WebP before changing the reference and deletes old bytes after commit', async ({
    assert,
  }) => {
    const { profile, input } = await fixture()
    const oldKey = profile.picture
    const deleted: string[] = []
    const storage: ProfilePictureStorage = {
      async put(_key, contents): Promise<void> {
        const current = await Profile.findOrFail(profile.id)
        const metadata = await sharp(contents).metadata()
        assert.equal(current.picture, oldKey)
        assert.equal(metadata.format, 'webp')
      },
      async delete(key): Promise<void> {
        const current = await Profile.findOrFail(profile.id)
        assert.notEqual(current.picture, key)
        deleted.push(key)
      },
    }
    const key = await replaceProfilePicture(profile.userId, input, storage)
    const current = await Profile.findOrFail(profile.id)
    assert.equal(current.picture, key)
    assert.match(key, new RegExp(`^profile/${profile.userId}/.+\\.webp$`))
    assert.deepEqual(deleted, [oldKey])
  }).skip(!schema)

  test('storage failure leaves the previous reference and image intact', async ({ assert }) => {
    const { profile, input } = await fixture()
    const deleted: string[] = []
    await assert.rejects(
      () =>
        replaceProfilePicture(profile.userId, input, {
          async put(): Promise<void> {
            throw new Error('simulated storage failure')
          },
          async delete(key): Promise<void> {
            deleted.push(key)
          },
        }),
      'simulated storage failure'
    )
    const current = await Profile.findOrFail(profile.id)
    assert.equal(current.picture, profile.picture)
    assert.notInclude(deleted, profile.picture)
  }).skip(!schema)

  test('database failure removes the newly uploaded object while preserving the old photo', async ({
    assert,
  }) => {
    const { profile, input } = await fixture()
    const constraint = `reject_picture_${profile.id}`
    await db.rawQuery(
      `ALTER TABLE profiles ADD CONSTRAINT ${constraint} CHECK (id <> ${profile.id} OR picture NOT LIKE 'profile/%')`
    )
    let uploaded = ''
    const deleted: string[] = []
    try {
      await assert.rejects(() =>
        replaceProfilePicture(profile.userId, input, {
          async put(key): Promise<void> {
            uploaded = key
          },
          async delete(key): Promise<void> {
            deleted.push(key)
          },
        })
      )
      const current = await Profile.findOrFail(profile.id)
      assert.equal(current.picture, profile.picture)
      assert.deepEqual(deleted, [uploaded])
    } finally {
      await db.rawQuery(`ALTER TABLE profiles DROP CONSTRAINT ${constraint}`)
    }
  }).skip(!schema)

  test('concurrent replacements retain exactly the final referenced object', async ({ assert }) => {
    const { profile, input } = await fixture()
    const objects = new Set([profile.picture])
    const storage: ProfilePictureStorage = {
      async put(key): Promise<void> {
        objects.add(key)
      },
      async delete(key): Promise<void> {
        objects.delete(key)
      },
    }
    await Promise.all(
      Array.from({ length: 3 }, () => replaceProfilePicture(profile.userId, input, storage))
    )
    const current = await Profile.findOrFail(profile.id)
    assert.deepEqual([...objects], [current.picture])
  }).skip(!schema)

  test('does not delete a previous key referenced by another profile', async ({ assert }) => {
    const { profile, input } = await fixture()
    const other = await fixture()
    await other.profile.merge({ picture: profile.picture }).save()
    const deleted: string[] = []
    await replaceProfilePicture(profile.userId, input, {
      async put(): Promise<void> {},
      async delete(key): Promise<void> {
        deleted.push(key)
      },
    })
    assert.deepEqual(deleted, [])
  }).skip(!schema)

  test('stores a publicly readable, decodable WebP using the real test bucket', async ({
    assert,
  }) => {
    const { profile, input } = await fixture()
    const tracked: string[] = []
    try {
      const key = await replaceProfilePicture(profile.userId, input, {
        async put(name, contents): Promise<void> {
          tracked.push(name)
          await profilePictureStorage.put(name, contents)
        },
        async delete(name): Promise<void> {
          if (tracked.includes(name)) await profilePictureStorage.delete(name)
        },
      })
      const url = `${env.get('DRIVE_ENDPOINT').replace(/\/$/, '')}/${env.get('DRIVE_BUCKET')}/${key}`
      const response = await fetch(url)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/webp')
      const bytes = Buffer.from(await response.arrayBuffer())
      const metadata = await sharp(bytes).metadata()
      assert.equal(metadata.width, 512)
      await sharp(bytes).raw().toBuffer()
    } finally {
      for (const key of tracked) await profilePictureStorage.delete(key)
      console.log(`Cleaned ${tracked.length} owned profile image storage objects`)
    }
  })
    .skip(!schema)
    .timeout(30_000)

  test('migration preserves an existing URL, is resumable, and restores exact original bytes', async ({
    assert,
  }) => {
    const { profile, input } = await fixture()
    const key = `profile-image-migration-test/${randomUUID()}.jpg`
    const directory = await mkdtemp(join(tmpdir(), 'profile-image-migration-'))
    try {
      await minioClient.send(
        new PutObjectCommand({
          Bucket: env.get('DRIVE_BUCKET'),
          Key: key,
          Body: input,
          ContentType: 'image/jpeg',
          ACL: 'public-read',
          CacheControl: 'public, max-age=60',
          Metadata: { purpose: 'owned-test' },
        })
      )
      await profile.merge({ picture: key }).save()
      for (const mode of ['prepare', 'apply', 'apply', 'verify']) {
        await promisify(execFile)(process.execPath, [
          'scripts/optimize-profile-images.mjs',
          '--environment=test',
          `--schema=${schema}`,
          `--directory=${directory}`,
          `--mode=${mode}`,
        ])
      }
      const current = await Profile.findOrFail(profile.id)
      assert.equal(current.picture, key)
      const head = await minioClient.send(
        new HeadObjectCommand({ Bucket: env.get('DRIVE_BUCKET'), Key: key })
      )
      assert.isBelow(head.ContentLength!, input.length)
      assert.equal(head.ContentType, 'image/jpeg')
      assert.equal(head.CacheControl, 'public, max-age=60')
      assert.equal(head.Metadata?.purpose, 'owned-test')
      assert.equal(head.Metadata?.['profile-optimization'], '512-v1')
      const result: { failures: unknown[] } = JSON.parse(
        await readFile(join(directory, 'verify-result.json'), 'utf8')
      )
      assert.deepEqual(result.failures, [])
      await promisify(execFile)(process.execPath, [
        'scripts/optimize-profile-images.mjs',
        '--environment=test',
        `--schema=${schema}`,
        `--directory=${directory}`,
        '--mode=rollback',
      ])
      const restored = await minioClient.send(
        new GetObjectCommand({ Bucket: env.get('DRIVE_BUCKET'), Key: key })
      )
      assert.deepEqual(Buffer.from(await restored.Body!.transformToByteArray()), input)
      assert.isUndefined(restored.Metadata?.['profile-optimization'])
    } finally {
      await profilePictureStorage.delete(key)
      await rm(directory, { recursive: true, force: true })
      console.log('Cleaned owned migration fixture and local test backups')
    }
  })
    .skip(!schema)
    .timeout(60_000)
})
