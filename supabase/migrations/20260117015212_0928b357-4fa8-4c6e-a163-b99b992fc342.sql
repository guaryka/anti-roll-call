-- Add weeks_count to classes table
ALTER TABLE public.classes 
ADD COLUMN weeks_count integer NOT NULL DEFAULT 15;

-- Add attendance timer fields to classes table
ALTER TABLE public.classes 
ADD COLUMN attendance_duration_minutes integer DEFAULT NULL,
ADD COLUMN attendance_started_at timestamp with time zone DEFAULT NULL;

-- Add week number to attendance_records table
ALTER TABLE public.attendance_records 
ADD COLUMN week_number integer NOT NULL DEFAULT 1;