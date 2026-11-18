-- Rating tab: each user can hide their diary from the others. Additive, defaults to visible.
ALTER TABLE "settings" ADD COLUMN "show_in_rating" boolean DEFAULT true NOT NULL;
