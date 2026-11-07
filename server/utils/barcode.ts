/** GS1 check digit: weights 3,1,3,… from the right, excluding the check digit itself. */
export function gtinCheckOk(digits: string) {
  let sum = 0
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1])
}

/**
 * Normalise a scanned/typed barcode to the GTIN form OFF uses.
 * Returns null if it isn't one, 'bad_check' if the check digit is wrong
 * (almost always a misread digit, e.g. from a blurry photo).
 */
export function normalizeBarcode(raw: string): string | null | 'bad_check' {
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 12) digits = `0${digits}` // UPC-A → EAN-13
  if (![8, 13, 14].includes(digits.length)) return null
  return gtinCheckOk(digits) ? digits : 'bad_check'
}

/** normalizeBarcode or a 400 that tells Claude what to do next. */
export function requireBarcode(raw: string) {
  const b = normalizeBarcode(raw)
  if (b === 'bad_check') throw createError({ statusCode: 400, statusMessage: `Barcode ${raw} fails the check digit, so a digit is misread. Re-read the digits under the bars, or ask the user to type them or send a sharper photo.` })
  if (!b) throw createError({ statusCode: 400, statusMessage: 'Barcode must be 8, 12, 13 or 14 digits' })
  return b
}
