-- Vasyl, 2026-11-21: Nadia applies serum twice a day, morning and evening, every day.
-- Insert-only (listed first, sort -2/-1): two daily routines for user "nadia" (if she exists and doesn't have them yet). No other data touched.
INSERT INTO "hair_routines" ("user_id", "name", "per_week", "duration_min", "sort", "created_on")
SELECT 'nadia', v.name, 7, 1, v.sort, (now() AT TIME ZONE 'Europe/Warsaw')::date
FROM (VALUES ('Сыворотка утром', -2), ('Сыворотка вечером', -1)) AS v(name, sort)
WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = 'nadia')
  AND NOT EXISTS (SELECT 1 FROM "hair_routines" r WHERE r."user_id" = 'nadia' AND r."name" = v.name AND r."archived_at" IS NULL);
