import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import Profile from '#models/profile'
import { minioClient } from '#config/drive'
import env from '#start/env'
import { optimizeProfileImage } from '#services/profile_image_service'

export interface ProfilePictureStorage {
  put(key: string, contents: Buffer): Promise<void>
  delete(key: string): Promise<void>
}

export const profilePictureStorage: ProfilePictureStorage = {
  async put(key, contents): Promise<void> {
    await minioClient.send(
      new PutObjectCommand({
        Bucket: env.get('DRIVE_BUCKET'),
        Key: key,
        Body: contents,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        ACL: 'public-read',
      })
    )
  },
  async delete(key): Promise<void> {
    await minioClient.send(new DeleteObjectCommand({ Bucket: env.get('DRIVE_BUCKET'), Key: key }))
  },
}

async function removeUnreferencedPicture(
  key: string,
  storage: ProfilePictureStorage
): Promise<void> {
  try {
    if (!(await Profile.query().where('picture', key).first())) {
      await storage.delete(key)
    }
  } catch {
    logger.warn({ key }, 'Profile picture cleanup deferred; reference check or deletion failed')
  }
}

export async function replaceProfilePicture(
  userId: number,
  input: Buffer,
  storage: ProfilePictureStorage = profilePictureStorage
): Promise<string> {
  await Profile.findByOrFail('user_id', userId)
  const contents = await optimizeProfileImage(input)
  const key = `profile/${userId}/${randomUUID()}.webp`
  let previous: string | null = null

  try {
    await storage.put(key, contents)
    previous = await db.transaction(async (trx): Promise<string | null> => {
      const profile = await Profile.query({ client: trx })
        .where('user_id', userId)
        .forUpdate()
        .firstOrFail()
      const oldKey = profile.picture || null
      profile.picture = key
      await profile.save()
      return oldKey
    })
  } catch (error) {
    // A lost commit acknowledgement can still leave this key referenced.
    await removeUnreferencedPicture(key, storage)
    throw error
  }

  if (previous && previous !== key) {
    await removeUnreferencedPicture(previous, storage)
  }
  return key
}
