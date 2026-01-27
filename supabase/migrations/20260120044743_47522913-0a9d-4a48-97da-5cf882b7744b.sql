-- Add is_teacher column to track teacher accounts
-- We'll use a simple approach: teachers have limited admin access
-- Admin email is fixed: admindiemdanh@gmail.com

-- Create teachers table to store teacher accounts
CREATE TABLE public.teachers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID -- The admin who created this teacher
);

-- Enable RLS
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can read teachers (to check if they're teachers)
CREATE POLICY "Anyone authenticated can view teachers"
ON public.teachers
FOR SELECT
TO authenticated
USING (true);

-- Only admin can insert/update/delete teachers
-- We identify admin by email
CREATE POLICY "Only admin can manage teachers"
ON public.teachers
FOR ALL
TO authenticated
USING (auth.email() = 'admindiemdanh@gmail.com')
WITH CHECK (auth.email() = 'admindiemdanh@gmail.com');