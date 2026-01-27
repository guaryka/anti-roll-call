-- Add GPS location columns to classes table for admin location
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS admin_latitude double precision DEFAULT NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS admin_longitude double precision DEFAULT NULL;