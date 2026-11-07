-- Single settings row (handoff §9: kcal_goal = 2500, no macro goals yet). Idempotent.
INSERT INTO "settings" ("id", "kcal_goal", "timezone") VALUES (1, 2500, 'Europe/Warsaw') ON CONFLICT ("id") DO NOTHING;
