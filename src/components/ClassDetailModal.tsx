import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Calendar,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [attendanceSearch, setAttendanceSearch] = useState(""); // Search for attendance
  const [studentSearch, setStudentSearch] = useState(""); // Search for student list
  const [showImportSection, setShowImportSection] = useState(false); // Collapsible import
  const [showDuplicates, setShowDuplicates] = useState(false); // Show duplicate attendance
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search filter for students list
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const searchLower = studentSearch.toLowerCase().trim();
    return students.filter(s => 
      s.name.toLowerCase().includes(searchLower) ||
      s.student_code.toLowerCase().includes(searchLower)
    );
  }, [students, studentSearch]);

  // Find duplicate attendance (same student attended 2+ times in same week)
  const duplicateRecords = useMemo(() => {
    const countMap = new Map<string, AttendanceRecord[]>();
    attendanceRecords.forEach(r => {
      const key = `${r.student_code.toLowerCase()}_week${r.week_number}`;
      if (!countMap.has(key)) {
        countMap.set(key, []);
      }
      countMap.get(key)!.push(r);
    });
    
    const duplicates: AttendanceRecord[] = [];
    countMap.forEach(records => {
      if (records.length >= 2) {
        duplicates.push(...records);
      }
    });
    return duplicates.sort((a, b) => a.week_number - b.week_number);
  }, [attendanceRecords]);

  // Search filter for attendance - shows all weeks for a matching student
  const filteredAttendanceRecords = useMemo(() => {
    // If showing duplicates, return duplicate records only
    if (showDuplicates) {
      return duplicateRecords;
    }
    
    if (!attendanceSearch.trim()) {
      // No search - use week filter
      if (attendanceWeekFilter === null) return attendanceRecords;
      return attendanceRecords.filter(r => r.week_number === attendanceWeekFilter);
    }
    
    // With search - show all weeks for matching students
    const searchLower = attendanceSearch.toLowerCase().trim();
    return attendanceRecords.filter(r => 
      r.name.toLowerCase().includes(searchLower) ||
      r.student_code.toLowerCase().includes(searchLower)
    );
  }, [attendanceRecords, attendanceWeekFilter, attendanceSearch, showDuplicates, duplicateRecords]);

  useEffect(() => {
    fetchData();
    subscribeToAttendance();
  }, [classInfo.id]);

  const fetchData = async () => {
    try {
      const [studentsRes, attendanceRes] = await Promise.all([
        supabase.from("students" as any).select("*").eq("class_id", classInfo.id).order("name"),
        supabase.from("attendance_records" as any).select("*").eq("class_id", classInfo.id).order("created_at", { ascending: false }),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      setStudents((studentsRes.data as any[]) || []);
      setAttendanceRecords((attendanceRes.data as any[]) || []);
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
        .from("students" as any)
        .insert(studentsToInsert)
        .select();

      if (error) throw error;

      setStudents((prev) => [...prev, ...((data as any[]) || [])]);
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
        .from("students" as any)
        .insert(studentsToInsert)
        .select();

      if (error) throw error;

      setStudents((prev) => [...prev, ...((insertedData as any[]) || [])]);
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
      const { error } = await supabase.from("students" as any).delete().eq("id", studentId);
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
      const { error } = await supabase.from("attendance_records" as any).delete().eq("id", recordId);
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
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Tabs defaultValue="students" className="flex-1 flex flex-col min-h-0">
            <div className="mx-4 md:mx-6 mt-3 shrink-0 flex items-center justify-between flex-wrap gap-2">
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

            <TabsContent value="students" className="flex-1 flex flex-col min-h-0 mt-2 px-4 md:px-6 pb-4 md:pb-6 data-[state=inactive]:hidden">
              {/* Collapsible Excel Import */}
              <Collapsible open={showImportSection} onOpenChange={setShowImportSection} className="mb-3 shrink-0">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      Import / Export Excel
                    </span>
                    {showImportSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="p-4 bg-muted/50 rounded-xl">
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
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Tải file
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportExcel}
                        disabled={students.length === 0}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Xuất Excel
                      </Button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <textarea
                        placeholder="Nguyễn Văn A, SV001, 1&#10;Trần Thị B, SV002, 2"
                        value={excelInput}
                        onChange={(e) => setExcelInput(e.target.value)}
                        className="flex-1 min-h-[60px] p-3 border rounded-lg text-sm resize-none bg-background"
                      />
                      <Button
                        onClick={handleImportExcel}
                        disabled={isImporting}
                        className="btn-primary-gradient sm:self-end"
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
                </CollapsibleContent>
              </Collapsible>

              {/* Search and Week selector row */}
              <div className="mb-2 flex flex-col sm:flex-row gap-2 shrink-0">
                {/* Search box */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm tên hoặc mã SV..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-10 h-9"
                  />
                </div>
                
                {/* Week selector */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  <span className="text-sm text-muted-foreground whitespace-nowrap mr-1">Tuần:</span>
                  {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => (
                    <Button
                      key={week}
                      size="sm"
                      variant={currentWeek === week ? "default" : "outline"}
                      onClick={() => setCurrentWeek(week)}
                      className="min-w-[36px] h-8 px-2"
                    >
                      {week}
                    </Button>
                  ))}
                </div>
              </div>
              
              {studentSearch && (
                <p className="text-xs text-muted-foreground mb-2 shrink-0">
                  Tìm thấy {filteredStudents.length} sinh viên
                </p>
              )}

              {/* Students List with attendance status */}
              <div className="flex-1 min-h-0 overflow-hidden">
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
                  <div className="border rounded-xl overflow-hidden h-full">
                    <div className="overflow-auto h-full">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0 z-10">
                          <tr>
                            <th className="text-left p-2 md:p-3 font-medium">#</th>
                            <th className="text-left p-2 md:p-3 font-medium">Tên sinh viên</th>
                            <th className="text-left p-2 md:p-3 font-medium hidden sm:table-cell">Mã SV</th>
                            <th className="text-left p-2 md:p-3 font-medium hidden md:table-cell">Nhóm</th>
                            <th className="text-center p-2 md:p-3 font-medium">T{currentWeek}</th>
                            <th className="text-center p-2 md:p-3 font-medium">
                              <Star className="w-4 h-4 inline text-yellow-500" />
                            </th>
                            <th className="text-right p-2 md:p-3 font-medium">Xóa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                        {filteredStudents.map((student, index) => {
                          const attended = didAttendInWeek(student.student_code, currentWeek);
                          const bonusPoints = getTotalBonusPoints(student.student_code);
                          return (
                            <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-2 md:p-3 text-muted-foreground">{index + 1}</td>
                              <td className="p-2 md:p-3 font-medium">
                                <div>{student.name}</div>
                                <div className="text-xs text-muted-foreground sm:hidden">{student.student_code}</div>
                              </td>
                              <td className="p-2 md:p-3 font-mono hidden sm:table-cell">{student.student_code}</td>
                              <td className="p-2 md:p-3 hidden md:table-cell">{student.group_number}</td>
                              <td className="p-2 md:p-3 text-center">
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
                              <td className="p-2 md:p-3 text-center">
                                {bonusPoints > 0 && (
                                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                                    +{bonusPoints}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 md:p-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
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
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="attendance" className="flex-1 flex flex-col min-h-0 mt-2 px-4 md:px-6 pb-4 md:pb-6 data-[state=inactive]:hidden">
              {/* Search box and duplicate check button */}
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm tên hoặc mã SV..."
                    value={attendanceSearch}
                    onChange={(e) => {
                      setAttendanceSearch(e.target.value);
                      setShowDuplicates(false);
                    }}
                    className="pl-10 h-9"
                  />
                </div>
                <Button
                  size="sm"
                  variant={showDuplicates ? "default" : "outline"}
                  onClick={() => {
                    setShowDuplicates(!showDuplicates);
                    setAttendanceSearch("");
                  }}
                  className="flex items-center gap-2 h-9"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Kiểm tra lặp {duplicateRecords.length > 0 && `(${duplicateRecords.length})`}
                </Button>
              </div>
              
              {attendanceSearch && (
                <p className="text-xs text-muted-foreground mt-1 shrink-0">
                  Tìm thấy {filteredAttendanceRecords.length} kết quả - hiển thị tất cả tuần
                </p>
              )}
              
              {showDuplicates && (
                <p className="text-xs text-yellow-600 mt-1 shrink-0 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Hiển thị {duplicateRecords.length} bản ghi lặp (sinh viên điểm danh ≥2 lần trong cùng tuần)
                </p>
              )}

              {/* Week filter for attendance */}
              {!attendanceSearch && !showDuplicates && (
                <div className="flex items-center gap-1 shrink-0 overflow-x-auto py-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap mr-1">Lọc:</span>
                  <Button
                    size="sm"
                    variant={attendanceWeekFilter === null ? "default" : "outline"}
                    onClick={() => setAttendanceWeekFilter(null)}
                    className="min-w-[50px] h-8 px-2"
                  >
                    Tất cả
                  </Button>
                  {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => (
                    <Button
                      key={week}
                      size="sm"
                      variant={attendanceWeekFilter === week ? "default" : "outline"}
                      onClick={() => setAttendanceWeekFilter(week)}
                      className="min-w-[36px] h-8 px-2"
                    >
                      {week}
                    </Button>
                  ))}
                </div>
              )}

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredAttendanceRecords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{attendanceSearch ? "Không tìm thấy kết quả" : showDuplicates ? "Không có bản ghi lặp" : "Chưa có ai điểm danh"}</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto mt-2">
                  {/* Group records by week if filter is null and no search and not showing duplicates */}
                  {attendanceWeekFilter === null && !attendanceSearch && !showDuplicates ? (
                    <div className="space-y-4">
                      {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => {
                        const weekRecords = filteredAttendanceRecords.filter(r => r.week_number === week);
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
                    <div className="overflow-x-auto border rounded-xl">
                      <table className="w-full">
                        <thead className="bg-muted/50 sticky top-0 z-10">
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
                          {filteredAttendanceRecords.map((record, index) => (
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
