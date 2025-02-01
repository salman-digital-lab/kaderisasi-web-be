import env from '#start/env'
import { defineConfig, services } from '@adonisjs/drive'
import { S3Client } from '@aws-sdk/client-s3'

export const minioClient = new S3Client({
  credentials: {
    accessKeyId: env.get('DRIVE_ACCESS_KEY_ID'),
    secretAccessKey: env.get('DRIVE_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true,
  endpoint: env.get('DRIVE_ENDPOINT'),
  region: env.get('DRIVE_REGION'),
})

const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK'),

  services: {
    minio: services.s3({
      client: minioClient,
      bucket: env.get('DRIVE_BUCKET'),
      visibility: 'public',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
