export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  return { photos: await listPhotos(uid), limit: PHOTOS_PER_USER }
})
