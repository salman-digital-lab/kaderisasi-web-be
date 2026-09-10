import { test } from '@japa/runner'
import sharp from 'sharp'
import { optimizeProfileImage } from '#services/profile_image_service'

test.group('Profile image optimization', () => {
  test('resizes and orients a portrait without cropping and strips metadata', async ({
    assert,
  }) => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#346c9c' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const output = await optimizeProfileImage(input)
    const metadata = await sharp(output).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.height, 512)
    assert.closeTo(metadata.width!, 341, 1)
    assert.isUndefined(metadata.exif)
    assert.isUndefined(metadata.orientation)
    assert.isBelow(output.length, input.length)
    await sharp(output).raw().toBuffer()
  })

  test('preserves transparency and does not enlarge small images', async ({ assert }) => {
    const input = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 4,
        background: { r: 20, g: 80, b: 120, alpha: 0.3 },
      },
    })
      .png()
      .toBuffer()
    const output = await optimizeProfileImage(input)
    const metadata = await sharp(output).metadata()
    assert.equal(metadata.width, 96)
    assert.equal(metadata.height, 64)
    assert.isTrue(metadata.hasAlpha)
  })

  test('can preserve JPEG and PNG formats for existing URLs', async ({ assert }) => {
    for (const format of ['jpeg', 'png'] as const) {
      const input = await sharp({
        create: { width: 800, height: 1200, channels: 3, background: '#f0b080' },
      })
        .toFormat(format)
        .toBuffer()
      const output = await optimizeProfileImage(input, format)
      const metadata = await sharp(output).metadata()
      assert.equal(metadata.format, format)
      assert.equal(metadata.height, 512)
      assert.closeTo(metadata.width!, 341, 1)
    }
  })

  test('rejects invalid, disguised SVG, and excessive-pixel images', async ({ assert }) => {
    await assert.rejects(() => optimizeProfileImage(Buffer.from('not an image')), 'INVALID_PICTURE')
    await assert.rejects(
      () => optimizeProfileImage(Buffer.from('<svg width="10" height="10"></svg>')),
      'INVALID_PICTURE'
    )
    const input = await sharp({
      create: { width: 6400, height: 6400, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer()
    await assert.rejects(() => optimizeProfileImage(input), 'INVALID_PICTURE')
  }).timeout(10_000)
})
