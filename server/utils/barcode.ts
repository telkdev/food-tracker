/** Normalise a scanned/typed barcode to the GTIN form OFF uses. Returns null if it isn't one. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12) return `0${digits}` // UPC-A → EAN-13
  if ([8, 13, 14].includes(digits.length)) return digits
  return null
}
