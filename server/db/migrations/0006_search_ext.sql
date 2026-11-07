-- Forgiving product search: diacritics-insensitive (twarog = Twaróg) and typo-tolerant (trigrams).
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- unaccent() is only STABLE; an IMMUTABLE wrapper lets us use it freely in expressions/indexes.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT unaccent('unaccent'::regdictionary, $1) $$;
