/**
 * Shrinks a picked photo in the browser before upload: a ~1600 px JPEG for viewing and a ~480 px thumbnail.
 * Re-encoding through a canvas also drops EXIF (GPS, camera), and <img> applies the EXIF rotation first.
 */
export const PHOTO_SIDE = 1600
export const THUMB_SIDE = 480
const PHOTO_MAX = 1_000_000
const THUMB_MAX = 125_000

async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  }
  finally {
    // the decoded bitmap stays usable for drawImage after the URL is gone
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export const fitSize = (w: number, h: number, side: number) => {
  const k = Math.min(1, side / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

function toJpeg(canvas: HTMLCanvasElement, q: number) {
  return new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', q))
}

async function encode(img: HTMLImageElement, side: number, max: number, qs: number[]) {
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, side)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  let blob: Blob | null = null
  for (const q of qs) {
    blob = await toJpeg(c, q)
    if (blob.size <= max) break
  }
  c.width = 0 // free memory on iOS
  if (!blob || blob.size > max) throw new Error('photo too large')
  return { blob, w, h }
}

export async function preparePhoto(file: Blob) {
  const img = await decode(file)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('not an image')
  const full = await encode(img, PHOTO_SIDE, PHOTO_MAX, [0.82, 0.72, 0.6, 0.5])
  const thumb = await encode(img, THUMB_SIDE, THUMB_MAX, [0.75, 0.6, 0.45])
  return { image: full.blob, thumb: thumb.blob, width: full.w, height: full.h }
}
