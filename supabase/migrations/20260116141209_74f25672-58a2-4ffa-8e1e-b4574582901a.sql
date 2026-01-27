-- Bảng lưu thông tin các lớp học
CREATE TABLE public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code VARCHAR(6) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bảng lưu danh sách sinh viên (import từ Excel)
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  student_code TEXT NOT NULL,
  group_number TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bảng lưu thông tin điểm danh
CREATE TABLE public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  student_code TEXT NOT NULL,
  group_number TEXT NOT NULL,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Classes: Allow public to read (để kiểm tra mã lớp)
CREATE POLICY "Anyone can read classes" ON public.classes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage classes" ON public.classes FOR ALL USING (auth.uid() IS NOT NULL);

-- Students: Allow public to read, authenticated can manage
CREATE POLICY "Anyone can read students" ON public.students FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage students" ON public.students FOR ALL USING (auth.uid() IS NOT NULL);

-- Attendance: Allow public to insert (người dùng điểm danh), authenticated can read all
CREATE POLICY "Anyone can insert attendance" ON public.attendance_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read attendance" ON public.attendance_records FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage attendance" ON public.attendance_records FOR ALL USING (auth.uid() IS NOT NULL);

-- Enable realtime for attendance
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;

-- Storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('attendance-photos', 'attendance-photos', true);

-- Storage policies
CREATE POLICY "Anyone can upload photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attendance-photos');
CREATE POLICY "Anyone can view photos" ON storage.objects FOR SELECT USING (bucket_id = 'attendance-photos');