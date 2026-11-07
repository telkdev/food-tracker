import { describe, expect, it } from 'vitest'
import { normalizeBarcode } from '../server/utils/barcode'

describe('normalizeBarcode', () => {
  it('accepts valid EAN-13, EAN-8, UPC-A', () => {
    expect(normalizeBarcode('4006381333931')).toBe('4006381333931')
    expect(normalizeBarcode('9638-5074')).toBe('96385074')
    expect(normalizeBarcode('036000291452')).toBe('0036000291452')
  })
  it('flags a single misread digit', () => {
    expect(normalizeBarcode('4006381333932')).toBe('bad_check')
    expect(normalizeBarcode('4006381383931')).toBe('bad_check')
  })
  it('rejects wrong lengths', () => {
    expect(normalizeBarcode('12345')).toBeNull()
  })
})
