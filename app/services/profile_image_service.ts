import sharp from 'sharp'

export type ProfileImageFormat = 'jpeg' | 'png' | 'webp'

export class InvalidProfileImageError extends Error {
  constructor() {
    super('INVALID_PICTURE')
  }
}

export async function optimizeProfileImage(
  input: Buffer,
  format: ProfileImageFormat = 'webp'
): Promise<Buffer> {
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
    const metadata = await image.metadata()
    if (
      !metadata.format ||
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new InvalidProfileImageError()
    }

    const resized = image
      .autoOrient()
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })

    switch (format) {
      case 'jpeg':
        return await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      case 'png':
        return await resized.png({ compressionLevel: 9 }).toBuffer()
      case 'webp':
        return await resized.webp({ quality: 82, effort: 4 }).toBuffer()
    }
  } catch {
    throw new InvalidProfileImageError()
  }
}
