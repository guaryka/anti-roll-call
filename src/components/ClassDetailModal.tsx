import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  X, 
  Upload, 
  Users, 
  CheckCircle, 
  Image as ImageIcon, 
  Loader2,
  FileSpreadsheet,
  Trash2,
  Copy,
  Download,
  Check,
  XCircle,
  FolderOpen,
  Star,
  Calendar
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PhotoViewModal from "@/components/PhotoViewModal";
import PhotoStorageModal from "@/components/PhotoStorageModal";
import * as XLSX from "xlsx";
import { normalizeName } from "@/lib/nameUtils";

interface ClassInfo {
  id: string;
  name: string;
  code: string;
  weeks_count: number;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
}

interface AttendanceRecord {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
  photo_url: string;
  created_at: string;
  week_number: number;
  bonus_points?: number;
}

interface ClassDetailModalProps {
  classInfo: ClassInfo;
  onClose: () => void;
}

const ClassDetailModal = ({ classInfo, onClose }: ClassDetailModalProps) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [excelInput, setExcelInput] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [attendanceWeekFilter, setAttendanceWeekFilter] = useState<number | null>(null); // null = all weeks
  const [showPhotoStorage, setShowPhotoStorage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
    subscribeToAttendance();
  }, [classInfo.id]);

  const fetchData = async () => {
    try {
      const [studentsRes, attendanceRes] = await Promise.all([
        supabase.from("students").select("*").eq("class_id", classInfo.id).order("name"),
        supabase.from("attendance_records").select("*").eq("class_id", classInfo.id).order("created_at", { ascending: false }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      setStudents(studentsRes.data || []);
      setAttendanceRecords(attendanceRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Không thể tải dữ liệu!");
    } finally {
      setIsLoading(false);
    }
  };

  const subscribeToAttendance = () => {
    const channel = supabase
      .channel(`attendance-${classInfo.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance_records",
          filter: `class_id=eq.${classInfo.id}`,
        },
        (payload) => {
          setAttendanceRecords((prev) => [payload.new as AttendanceRecord, ...prev]);
          toast.success(`${(payload.new as AttendanceRecord).name} vừa điểm danh!`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const parseExcelInput = (text: string) => {
    const lines = text.trim().split("\n");
    const students: { name: string; student_code: string; group_number: string }[] = [];

    for (const line of lines) {
      const parts = line.split(/\t|,/).map((p) => p.trim());
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
        students.push({
          name: normalizeName(parts[0]), // Normalize name
          student_code: parts[1].trim(),
          group_number: parts[2].trim(),
        });
      }
    }

    return students;
  };

  const handleImportExcel = async () => {
    if (!excelInput.trim()) {
      toast.error("Vui lòng nhập dữ liệu!");
      return;
    }

    const parsedStudents = parseExcelInput(excelInput);
    if (parsedStudents.length === 0) {
      toast.error("Không tìm thấy dữ liệu hợp lệ! Định dạng: Tên, Mã SV, Số nhóm");
      return;
    }

    setIsImporting(true);
    try {
      const studentsToInsert = parsedStudents.map((s) => ({
        ...s,
        class_id: classInfo.id,
      }));

      const { data, error } = await supabase
        .from("students")
        .insert(studentsToInsert)
        .select();

      if (error) throw error;

      setStudents((prev) => [...prev, ...(data || [])]);
      setExcelInput("");
      toast.success(`Đã thêm ${parsedStudents.length} sinh viên!`);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Có lỗi xảy ra khi import!");
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { header: 1 });

      const parsedStudents: { name: string; student_code: string; group_number: string }[] = [];
      
      // Skip header row if exists
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown as string[];
        if (row && row.length >= 3 && row[0] && row[1] && row[2]) {
          // Skip if it looks like a header
          const firstCell = String(row[0]).toLowerCase();
          if (firstCell.includes('tên') || firstCell.includes('name') || firstCell === 'stt') continue;
          
          parsedStudents.push({
            name: normalizeName(String(row[0])), // Normalize name
            student_code: String(row[1]).trim(),
            group_number: String(row[2]).trim(),
          });
        }
      }

      if (parsedStudents.length === 0) {
        toast.error("Không tìm thấy dữ liệu hợp lệ trong file!");
        return;
      }

      const studentsToInsert = parsedStudents.map((s) => ({
        ...s,
        class_id: classInfo.id,
      }));

      const { data: insertedData, error } = await supabase
        .from("students")
        .insert(studentsToInsert)
        .select();

      if (error) throw error;

      setStudents((prev) => [...prev, ...(insertedData || [])]);
      toast.success(`Đã thêm ${parsedStudents.length} sinh viên từ file!`);
    } catch (error) {
      console.error("File upload error:", error);
      toast.error("Có lỗi xảy ra khi đọc file!");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      const { error } = await supabase.from("students").delete().eq("id", studentId);
      if (error) throw error;
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
      toast.success("Đã xóa sinh viên!");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Không thể xóa sinh viên!");
    }
  };

  const handleDeleteAttendance = async (recordId: string) => {
    try {
      const { error } = await supabase.from("attendance_records").delete().eq("id", recordId);
      if (error) throw error;
      setAttendanceRecords((prev) => prev.filter((r) => r.id !== recordId));
      toast.success("Đã xóa bản ghi điểm danh!");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Không thể xóa!");
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(classInfo.code);
    toast.success("Đã sao chép mã!");
  };

  // Check if student attended in a specific week
  const didAttendInWeek = (studentCode: string, week: number) => {
    return attendanceRecords.some(
      (r) => r.student_code.toLowerCase() === studentCode.toLowerCase() && r.week_number === week
    );
  };

  // Get total bonus points for a student
  const getTotalBonusPoints = (studentCode: string) => {
    return attendanceRecords
      .filter((r) => r.student_code.toLowerCase() === studentCode.toLowerCase())
      .reduce((sum, r) => sum + (r.bonus_points || 0), 0);
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = students.map((student) => {
      const weekData: Record<string, string> = {};
      let totalAttended = 0;
      
      for (let w = 1; w <= classInfo.weeks_count; w++) {
        const attended = didAttendInWeek(student.student_code, w);
        weekData[`Tuần ${w}`] = attended ? "✓" : "✗";
        if (attended) totalAttended++;
      }
      
      const totalBonusPoints = getTotalBonusPoints(student.student_code);
      
      return {
        "Tên sinh viên": student.name,
        "Mã sinh viên": student.student_code,
        "Nhóm": student.group_number,
        ...weekData,
        "Tổng điểm danh": `${totalAttended}/${classInfo.weeks_count}`,
        "Điểm cộng": totalBonusPoints,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Điểm danh");
    XLSX.writeFile(wb, `diem-danh-${classInfo.name}.xlsx`);
    toast.success("Đã xuất file Excel!");
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="fixed inset-4 md:inset-8 bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-6 border-b bg-card flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">{classInfo.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-muted-foreground">Mã điểm danh:</span>
              <button
                onClick={copyCode}
                className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
              >
                <span className="font-mono font-bold text-primary text-lg">{classInfo.code}</span>
                <Copy className="w-4 h-4 text-primary" />
              </button>
              <span className="text-sm text-muted-foreground">|</span>
              <span className="text-sm text-muted-foreground">{classInfo.weeks_count} tuần</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="students" className="h-full flex flex-col">
            <div className="mx-4 md:mx-6 mt-4 shrink-0 flex items-center justify-between flex-wrap gap-2">
              <TabsList>
                <TabsTrigger value="students" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Danh sách SV ({students.length})
                </TabsTrigger>
                <TabsTrigger value="attendance" className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Điểm danh ({attendanceRecords.length})
                </TabsTrigger>
              </TabsList>
              <Button
                variant="outline"
                onClick={() => setShowPhotoStorage(true)}
                className="flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Kho lưu trữ
              </Button>
            </div>

            <TabsContent value="students" className="flex-1 overflow-hidden flex flex-col mt-4 px-4 md:px-6 pb-4 md:pb-6">
              {/* Excel Import */}
              <div className="mb-4 p-4 bg-muted/50 rounded-xl shrink-0">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Import từ Excel
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Tải file Excel hoặc copy dữ liệu theo định dạng: Tên sinh viên, Mã SV, Số nhóm
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Tải file Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExportExcel}
                    disabled={students.length === 0}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Xuất Excel
                  </Button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    placeholder="Nguyễn Văn A, SV001, 1&#10;Trần Thị B, SV002, 2"
                    value={excelInput}
                    onChange={(e) => setExcelInput(e.target.value)}
                    className="flex-1 min-h-[80px] p-3 border rounded-lg text-sm resize-none bg-background"
                  />
                  <Button
                    onClick={handleImportExcel}
                    disabled={isImporting}
                    className="btn-primary-gradient self-end"
                  >
                    {isImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Import
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Week selector */}
              <div className="mb-4 flex items-center gap-2 shrink-0 overflow-x-auto pb-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Tuần:</span>
                {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => (
                  <Button
                    key={week}
                    size="sm"
                    variant={currentWeek === week ? "default" : "outline"}
                    onClick={() => setCurrentWeek(week)}
                    className="min-w-[40px]"
                  >
                    {week}
                  </Button>
                ))}
              </div>

              {/* Students List with attendance status */}
              <div className="flex-1 overflow-auto min-h-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : students.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Chưa có sinh viên. Hãy import từ Excel!</p>
                  </div>
                ) : (
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-3 text-sm font-medium">#</th>
                          <th className="text-left p-3 text-sm font-medium">Tên sinh viên</th>
                          <th className="text-left p-3 text-sm font-medium">Mã SV</th>
                          <th className="text-left p-3 text-sm font-medium">Nhóm</th>
                          <th className="text-center p-3 text-sm font-medium">Tuần {currentWeek}</th>
                          <th className="text-center p-3 text-sm font-medium">
                            <Star className="w-4 h-4 inline text-yellow-500" />
                          </th>
                          <th className="text-right p-3 text-sm font-medium">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {students.map((student, index) => {
                          const attended = didAttendInWeek(student.student_code, currentWeek);
                          const bonusPoints = getTotalBonusPoints(student.student_code);
                          return (
                            <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-3 text-sm text-muted-foreground">{index + 1}</td>
                              <td className="p-3 font-medium">{student.name}</td>
                              <td className="p-3 text-sm font-mono">{student.student_code}</td>
                              <td className="p-3 text-sm">{student.group_number}</td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => {
                                    toast.info(
                                      `${student.name} (${student.student_code}): ${attended ? "Đã điểm danh ✓" : "Chưa điểm danh ✗"}`,
                                      { duration: 3000 }
                                    );
                                  }}
                                  className="p-1 rounded hover:bg-muted/50 transition-colors"
                                >
                                  {attended ? (
                                    <Check className="w-5 h-5 text-green-600 mx-auto" />
                                  ) : (
                                    <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                                  )}
                                </button>
                              </td>
                              <td className="p-3 text-center">
                                {bonusPoints > 0 && (
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium">
                                    +{bonusPoints}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteStudent(student.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="attendance" className="flex-1 overflow-hidden flex flex-col mt-4 px-4 md:px-6 pb-4 md:pb-6">
              {/* Week filter for attendance */}
              <div className="flex items-center gap-2 shrink-0 overflow-x-auto pb-2 mb-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Lọc tuần:</span>
                <Button
                  size="sm"
                  variant={attendanceWeekFilter === null ? "default" : "outline"}
                  onClick={() => setAttendanceWeekFilter(null)}
                  className="min-w-[60px]"
                >
                  Tất cả
                </Button>
                {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => (
                  <Button
                    key={week}
                    size="sm"
                    variant={attendanceWeekFilter === week ? "default" : "outline"}
                    onClick={() => setAttendanceWeekFilter(week)}
                    className="min-w-[40px]"
                  >
                    {week}
                  </Button>
                ))}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : attendanceRecords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Chưa có ai điểm danh</p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  {/* Group records by week if filter is null */}
                  {attendanceWeekFilter === null ? (
                    <div className="space-y-6">
                      {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => {
                        const weekRecords = attendanceRecords.filter(r => r.week_number === week);
                        if (weekRecords.length === 0) return null;
                        return (
                          <div key={week} className="border rounded-xl overflow-hidden">
                            <div className="bg-primary/10 px-4 py-2 border-b">
                              <h3 className="font-semibold text-primary flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Tuần {week} ({weekRecords.length} lượt điểm danh)
                              </h3>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="text-left p-3 text-sm font-medium">#</th>
                                    <th className="text-left p-3 text-sm font-medium">Thời gian</th>
                                    <th className="text-left p-3 text-sm font-medium">Tên sinh viên</th>
                                    <th className="text-left p-3 text-sm font-medium">Mã SV</th>
                                    <th className="text-left p-3 text-sm font-medium">Nhóm</th>
                                    <th className="text-center p-3 text-sm font-medium">
                                      <Star className="w-4 h-4 inline text-yellow-500" />
                                    </th>
                                    <th className="text-center p-3 text-sm font-medium">Ảnh</th>
                                    <th className="text-right p-3 text-sm font-medium">Thao tác</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {weekRecords.map((record, index) => (
                                    <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                                      <td className="p-3 text-sm text-muted-foreground">{index + 1}</td>
                                      <td className="p-3 text-sm text-muted-foreground">
                                        {new Date(record.created_at).toLocaleString("vi-VN")}
                                      </td>
                                      <td className="p-3 font-medium">{record.name}</td>
                                      <td className="p-3 text-sm font-mono">{record.student_code}</td>
                                      <td className="p-3 text-sm">{record.group_number}</td>
                                      <td className="p-3 text-center">
                                        {record.bonus_points && record.bonus_points > 0 && (
                                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium">
                                            +{record.bonus_points}
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3 text-center">
                                        {record.photo_url && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedPhoto(record.photo_url)}
                                            className="text-primary hover:text-primary"
                                          >
                                            <ImageIcon className="w-4 h-4 mr-1" />
                                            Xem
                                          </Button>
                                        )}
                                      </td>
                                      <td className="p-3 text-right">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDeleteAttendance(record.id)}
                                        >
                                          <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-3 text-sm font-medium">#</th>
                            <th className="text-left p-3 text-sm font-medium">Thời gian</th>
                            <th className="text-left p-3 text-sm font-medium">Tên sinh viên</th>
                            <th className="text-left p-3 text-sm font-medium">Mã SV</th>
                            <th className="text-left p-3 text-sm font-medium">Nhóm</th>
                            <th className="text-center p-3 text-sm font-medium">Tuần</th>
                            <th className="text-center p-3 text-sm font-medium">
                              <Star className="w-4 h-4 inline text-yellow-500" />
                            </th>
                            <th className="text-center p-3 text-sm font-medium">Ảnh</th>
                            <th className="text-right p-3 text-sm font-medium">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {attendanceRecords
                            .filter(r => r.week_number === attendanceWeekFilter)
                            .map((record, index) => (
                            <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-3 text-sm text-muted-foreground">{index + 1}</td>
                              <td className="p-3 text-sm text-muted-foreground">
                                {new Date(record.created_at).toLocaleString("vi-VN")}
                              </td>
                              <td className="p-3 font-medium">{record.name}</td>
                              <td className="p-3 text-sm font-mono">{record.student_code}</td>
                              <td className="p-3 text-sm">{record.group_number}</td>
                              <td className="p-3 text-center">
                                <span className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-sm font-medium">
                                  {record.week_number}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {record.bonus_points && record.bonus_points > 0 && (
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium">
                                    +{record.bonus_points}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {record.photo_url && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedPhoto(record.photo_url)}
                                    className="text-primary hover:text-primary"
                                  >
                                    <ImageIcon className="w-4 h-4 mr-1" />
                                    Xem
                                  </Button>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteAttendance(record.id)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Photo View Modal */}
      {selectedPhoto && (
        <PhotoViewModal
          photoUrl={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      )}

      {/* Photo Storage Modal */}
      {showPhotoStorage && (
        <PhotoStorageModal
          classInfo={classInfo}
          onClose={() => setShowPhotoStorage(false)}
        />
      )}
    </div>
  );
};

export default ClassDetailModal;
