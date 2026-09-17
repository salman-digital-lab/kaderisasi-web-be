import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'

export interface FormFileSettings {
  accept: 'pdf' | 'image' | 'pdf_or_image'
  maxFiles: number
  maxSizeMB: number
}

export interface ProcessedFormFile {
  contents: Buffer
  mimeType: string
  extension: string
  width: number | null
  height: number | null
}

function hasAnimation(input: Buffer): boolean {
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const webp =
    input.subarray(0, 4).toString() === 'RIFF' && input.subarray(8, 12).toString() === 'WEBP'
  if (!png && !webp) return false
  for (let offset = png ? 8 : 12; offset + 8 <= input.length; ) {
    const length = png ? input.readUInt32BE(offset) : input.readUInt32LE(offset + 4)
    const kind = input.subarray(offset + (png ? 4 : 0), offset + (png ? 8 : 4)).toString()
    if (kind === 'acTL' || kind === 'ANIM' || kind === 'ANMF') return true
    offset += length + (png ? 12 : 8 + (length % 2))
  }
  return false
}

export function validFileSettings(value: unknown): value is FormFileSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as FormFileSettings
  return (
    ['pdf', 'image', 'pdf_or_image'].includes(settings.accept) &&
    Number.isInteger(settings.maxFiles) &&
    settings.maxFiles >= 1 &&
    settings.maxFiles <= 5 &&
    Number.isInteger(settings.maxSizeMB) &&
    settings.maxSizeMB >= 1 &&
    settings.maxSizeMB <= 10
  )
}

export async function processFormFile(
  input: Buffer,
  settings: FormFileSettings
): Promise<ProcessedFormFile> {
  if (
    !validFileSettings(settings) ||
    !input.length ||
    input.length > settings.maxSizeMB * 1024 * 1024
  ) {
    throw new Error('INVALID_FILE_SIZE')
  }
  if (input.subarray(0, 5).toString() === '%PDF-') {
    if (settings.accept === 'image') throw new Error('FILE_TYPE_NOT_ALLOWED')
    try {
      const pdf = await PDFDocument.load(input)
      if (pdf.getPageCount() < 1) throw new Error('INVALID_PDF')
    } catch {
      throw new Error('INVALID_PDF')
    }
    return {
      contents: input,
      mimeType: 'application/pdf',
      extension: 'pdf',
      width: null,
      height: null,
    }
  }
  if (settings.accept === 'pdf') throw new Error('FILE_TYPE_NOT_ALLOWED')
  if (hasAnimation(input)) throw new Error('INVALID_IMAGE')
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
    const metadata = await image.metadata()
    if (
      !metadata.format ||
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new Error('INVALID_IMAGE')
    }
    const { data, info } = await image
      .autoOrient()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    return {
      contents: data,
      mimeType: 'image/webp',
      extension: 'webp',
      width: info.width,
      height: info.height,
    }
  } catch {
    throw new Error('INVALID_IMAGE')
  }
}
