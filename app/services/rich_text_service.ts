import sanitizeHtml from 'sanitize-html'

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'a',
    'hr',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    h4: ['style'],
    h5: ['style'],
    h6: ['style'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(?:left|center|right|justify)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  nestingLimit: 20,
  disallowedTagsMode: 'discard',
}

/**
 * Sanitize administrator-authored rich text before it crosses the public API boundary.
 * The allowlist mirrors the formatting supported by the admin Tiptap editor.
 */
export const sanitizeRichText = (value: string): string => sanitizeHtml(value, RICH_TEXT_OPTIONS)
