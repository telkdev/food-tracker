import { eq } from 'drizzle-orm'

// Rule every new user starts with; the cooked-weight rule was Vasyl's own and is not copied.
const NEW_USER_PREFS = [
  { key: 'oil_and_sauce', text: 'For any cooked or dressed dish, if the user did not say, ask whether oil, butter or a sauce was used and how much. Log each as its own entry in the same meal (e.g. "olive oil" 5 g), never fold it into the dish.' },
]

/** The user's settings row; created with defaults (kcal 2500, Europe/Warsaw) the first time. */
export async function getSettings(uid: string) {
  const db = useDb()
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.userId, uid))
  if (row) return row
  const [created] = await db.insert(schema.settings).values({ userId: uid }).onConflictDoNothing().returning()
  if (created) await db.insert(schema.preferences).values(NEW_USER_PREFS.map(p => ({ ...p, userId: uid }))).onConflictDoNothing()
  const [again] = await db.select().from(schema.settings).where(eq(schema.settings.userId, uid))
  return again!
}
