import { test } from '@japa/runner'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { processFormFile, validFileSettings } from '#services/form_file_service'

test.group('Form file processing', () => {
  test('preserves PDF bytes and enforces the configured category', async ({ assert }) => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    const bytes = Buffer.from(await pdf.save())
    const settings = { accept: 'pdf' as const, maxFiles: 1, maxSizeMB: 10 }
    const result = await processFormFile(bytes, settings)
    assert.deepEqual(result.contents, bytes)
    assert.equal(result.mimeType, 'application/pdf')
    await assert.rejects(
      () => processFormFile(bytes, { ...settings, accept: 'image' }),
      'FILE_TYPE_NOT_ALLOWED'
    )
    await assert.rejects(
      () => processFormFile(Buffer.from('%PDF-not-a-document'), settings),
      'INVALID_PDF'
    )
  })
  test('optimizes and rotates images, strips metadata, preserves alpha, and never enlarges', async ({
    assert,
  }) => {
    const settings = { accept: 'image' as const, maxFiles: 5, maxSizeMB: 10 }
    const large = await sharp({
      create: {
        width: 3000,
        height: 1200,
        channels: 4,
        background: { r: 40, g: 80, b: 120, alpha: 0.5 },
      },
    })
      .png()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const result = await processFormFile(large, settings)
    const metadata = await sharp(result.contents).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 960)
    assert.equal(metadata.height, 2400)
    assert.isTrue(metadata.hasAlpha)
    assert.isUndefined(metadata.exif)
    assert.isUndefined(metadata.orientation)
    const small = await sharp({
      create: { width: 40, height: 20, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer()
    const optimized = await processFormFile(small, { ...settings, accept: 'pdf_or_image' })
    assert.equal(optimized.width, 40)
    assert.equal(optimized.height, 20)
    await assert.rejects(
      () => processFormFile(small, { ...settings, accept: 'pdf' }),
      'FILE_TYPE_NOT_ALLOWED'
    )
  })
  test('rejects malformed, oversized, unsupported, and excessive-pixel input', async ({
    assert,
  }) => {
    const settings = { accept: 'image' as const, maxFiles: 1, maxSizeMB: 1 }
    await assert.rejects(
      () => processFormFile(Buffer.from('not an image'), settings),
      'INVALID_IMAGE'
    )
    await assert.rejects(
      () => processFormFile(Buffer.alloc(1024 * 1024 + 1), settings),
      'INVALID_FILE_SIZE'
    )
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
    await assert.rejects(() => processFormFile(gif, settings), 'INVALID_IMAGE')
    const animated = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]), {
      raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer()
    const animatedMetadata = await sharp(animated).metadata()
    assert.equal(animatedMetadata.pages, 2)
    await assert.rejects(() => processFormFile(animated, settings), 'INVALID_IMAGE')
    const huge = await sharp({
      create: { width: 7000, height: 6000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer()
    await assert.rejects(
      () => processFormFile(huge, { ...settings, maxSizeMB: 10 }),
      'INVALID_IMAGE'
    )
    assert.isFalse(validFileSettings({ ...settings, maxFiles: 6 }))
    assert.isFalse(validFileSettings({ ...settings, maxSizeMB: 11 }))
    assert.isFalse(validFileSettings({ ...settings, accept: 'any' }))
  })
})
