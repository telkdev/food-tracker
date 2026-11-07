import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

let db: PostgresJsDatabase<typeof schema> | undefined

export function useDb() {
  if (!db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    db = drizzle(postgres(url, { max: 5 }), { schema })
  }
  return db
}

export { schema }
