-- Add bonus_points column to attendance_records table
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS bonus_points integer DEFAULT 0;

-- Add current_week column to classes table for default week when attendance is started
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS current_week integer DEFAULT 1;