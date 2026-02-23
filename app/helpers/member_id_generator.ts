/**
 * Generates a human-readable member ID from a user's internal integer ID.
 *
 * Format: XXXXXXX
 *   - 7-digit zero-padded sequential number
 *
 * Examples:
 *   generateMemberId(1)        → "00000001"
 *   generateMemberId(1000)     → "00001000"
 *   generateMemberId(1000000)  → "01000000"
 *
 * Capacity: up to 99,999,999 unique members.
 */
export function generateMemberId(id: number): string {
  return String(id).padStart(8, '0')
}
