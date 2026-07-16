import { test } from '@japa/runner'
import { sanitizeRichText } from '#services/rich_text_service'

test.group('Rich text sanitization', () => {
  test('preserves supported editor formatting', ({ assert }) => {
    const result = sanitizeRichText(
      '<h2 style="text-align: center">Judul</h2><p><strong>Isi</strong> <a href="https://example.com">tautan</a></p>'
    )

    assert.equal(
      result,
      '<h2 style="text-align:center">Judul</h2><p><strong>Isi</strong> <a href="https://example.com">tautan</a></p>'
    )
  })

  test('removes scripts, event handlers, and unsafe URLs', ({ assert }) => {
    const result = sanitizeRichText(
      '<script>alert(1)</script><p onclick="alert(1)">Aman</p><a href="javascript:alert(1)">buruk</a><img src=x onerror="alert(1)">'
    )

    assert.equal(result, '<p>Aman</p><a>buruk</a>')
  })

  test('does not allow protocol-relative links', ({ assert }) => {
    assert.equal(sanitizeRichText('<a href="//example.com">tautan</a>'), '<a>tautan</a>')
  })
})
