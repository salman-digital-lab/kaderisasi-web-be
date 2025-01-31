import env from '#start/env'
import { defineConfig, services } from '@adonisjs/drive'
import { S3Client } from '@aws-sdk/client-s3'

const minioClient = new S3Client({
  credentials: {
    accessKeyId: env.get('DRIVE_ACCESS_KEY_ID'),
    secretAccessKey: env.get('DRIVE_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true,
  endpoint: env.get('DRIVE_ENDPOINT'),
  region: 'sg-1',
})

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK'),

  services: {
    minio: services.s3({
      client: minioClient,
      bucket: env.get('DRIVE_BUCKET'),
      visibility: 'public',
    }),
    r2: services.s3({
      credentials: {
        accessKeyId: 'DRIVE_ACCESS_KEY_ID',
        secretAccessKey: 'DRIVE_SECRET_ACCESS_KEY',
      },

      endpoint: 'https://jg21.r2.cloudflarestorage.com',
      region: 'auto',
      supportsACL: false,

      bucket: 'DRIVE_BUCKET',
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
