import { and, asc, count, eq, sum } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { HairPhoto } from '../db/schema'

/**
 * Hair progress photos. Same access as the rest of the tab: requireHair (the logged-in user only,
 * never a diary someone shared). The browser sends two JPEGs it already shrank: the photo and a thumbnail.
 */
export const PHOTO_MAX = 1024 * 1024 // matches the DB check
export const THUMB_MAX = 128 * 1024
export const PHOTOS_PER_USER = 300 // ~75 MB at ~250 KB each; Neon free is 0.5 GB for the whole app

const P = () => schema.hairPhotos

export const hairPhotoMetaSchema = z.object({
  taken_on: isoDate.optional(),
  note: z.string().trim().max(300).nullable().optional(),
  width: z.coerce.number().int().min(1).max(4096),
  height: z.coerce.number().int().min(1).max(4096),
})
export const hairPhotoPatchSchema = z.object({
  taken_on: isoDate.optional(),
  note: z.string().trim().max(300).nullable().optional(),
})

const isJpeg = (b: Buffer) => b.length > 4 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF

const pub = (p: Pick<HairPhoto, 'id' | 'takenOn' | 'note' | 'width' | 'height' | 'bytes' | 'createdAt'>) => ({
  id: p.id, taken_on: p.takenOn, note: p.note, width: p.width, height: p.height, bytes: p.bytes, created_at: p.createdAt,
})
const metaCols = () => ({ id: P().id, takenOn: P().takenOn, note: P().note, width: P().width, height: P().height, bytes: P().bytes, createdAt: P().createdAt })

/** Oldest first (by the day shown, then upload time), without the image bytes. */
export async function listPhotos(uid: string) {
  const rows = await useDb().select(metaCols()).from(P()).where(eq(P().userId, uid)).orderBy(asc(P().takenOn), asc(P().createdAt))
  return rows.map(pub)
}

export async function photoStats(uid: string) {
  const [r] = await useDb().select({ n: count(), bytes: sum(P().bytes) }).from(P()).where(eq(P().userId, uid))
  return { count: Number(r?.n ?? 0), bytes: Number(r?.bytes ?? 0) }
}

async function checkDate(uid: string, d: string | undefined) {
  const today = localDate((await getSettings(uid)).timezone)
  const date = d ?? today
  if (date > today) throw createError({ statusCode: 400, statusMessage: 'date is in the future' })
  if (date < '2000-01-01') throw createError({ statusCode: 400, statusMessage: 'date is too old' })
  return date
}

/** multipart/form-data: image, thumb (JPEG files) + taken_on, note, width, height. */
export async function addPhoto(event: H3Event, uid: string) {
  const len = Number(getRequestHeader(event, 'content-length') || 0)
  if (len > PHOTO_MAX + THUMB_MAX + 64 * 1024) throw createError({ statusCode: 413, statusMessage: 'Photo is too large' })
  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'Expected multipart/form-data' })
  const field = (n: string) => parts.find(p => p.name === n && !p.filename)?.data.toString('utf8')
  const file = (n: string) => parts.find(p => p.name === n)?.data
  const image = file('image')
  const thumb = file('thumb')
  if (!image || !thumb || !isJpeg(image) || !isJpeg(thumb)) throw createError({ statusCode: 400, statusMessage: 'Expected JPEG image and thumb' })
  if (image.length > PHOTO_MAX || thumb.length > THUMB_MAX) throw createError({ statusCode: 413, statusMessage: 'Photo is too large' })
  const meta = parseOr400(hairPhotoMetaSchema, {
    taken_on: field('taken_on') || undefined, note: field('note') || null, width: field('width'), height: field('height'),
  })
  const takenOn = await checkDate(uid, meta.taken_on)
  if ((await photoStats(uid)).count >= PHOTOS_PER_USER) {
    throw createError({ statusCode: 400, statusMessage: `Too many photos (${PHOTOS_PER_USER} max). Delete a few old ones first.` })
  }
  const [row] = await useDb().insert(P()).values({
    userId: uid, takenOn, note: meta.note || null, width: meta.width, height: meta.height, bytes: image.length,
    image: Buffer.from(image), thumb: Buffer.from(thumb),
  }).returning(metaCols())
  return pub(row!)
}

export async function photoBytes(uid: string, id: string, size: 'full' | 'thumb') {
  const col = size === 'thumb' ? P().thumb : P().image
  const [row] = await useDb().select({ data: col }).from(P()).where(and(eq(P().userId, uid), eq(P().id, id)))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  return row.data
}

export async function updatePhoto(uid: string, id: string, input: z.infer<typeof hairPhotoPatchSchema>) {
  const set: Partial<HairPhoto> = {}
  if (input.taken_on !== undefined) set.takenOn = await checkDate(uid, input.taken_on)
  if (input.note !== undefined) set.note = input.note || null
  const where = and(eq(P().userId, uid), eq(P().id, id))
  const [row] = Object.keys(set).length
    ? await useDb().update(P()).set(set).where(where).returning(metaCols())
    : await useDb().select(metaCols()).from(P()).where(where)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  return pub(row)
}

export async function deletePhoto(uid: string, id: string) {
  const [row] = await useDb().delete(P()).where(and(eq(P().userId, uid), eq(P().id, id))).returning({ id: P().id })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  return { deleted: row.id }
}
