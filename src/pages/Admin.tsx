import { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LogOut, Plus, BookOpen, Users, Loader2, Copy, Trash2, Calendar, Clock, Key, MapPin, UserPlus } from "lucide-react";
import ClassDetailModal from "@/components/ClassDetailModal";
import CopyCodeModal from "@/components/CopyCodeModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import CreateTeacherModal from "@/components/CreateTeacherModal";
import useGPS from "@/hooks/useGPS";

interface ClassItem {
  id: string;
  name: string;
  code: string;
  created_at: string;
  weeks_count: number;
  attendance_duration_minutes: number | null;
  attendance_started_at: string | null;
  admin_latitude: number | null;
  admin_longitude: number | null;
  current_week: number | null;
}

const Admin = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [newWeeksCount, setNewWeeksCount] = useState("15");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [copyCodeClass, setCopyCodeClass] = useState<ClassItem | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCreateTeacher, setShowCreateTeacher] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // true only for admin, not teachers

  // Attendance timer state
  const [timerClassId, setTimerClassId] = useState<string | null>(null);
  const [timerMinutes, setTimerMinutes] = useState("");
  const [timerWeek, setTimerWeek] = useState("1");
  const [isGettingGPS, setIsGettingGPS] = useState(false);
  
  const { getAveragePosition } = useGPS();
  useEffect(() => {
    checkAuth();
    fetchClasses();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
      toast.error("Vui lòng đăng nhập!");
      return;
    }
    
    // Check if user is admin (only admin can create teachers)
    const userEmail = session.user.email?.toLowerCase();
    setIsAdmin(userEmail === "admindiemdanh@gmail.com");
  };

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error("Error fetching classes:", error);
      toast.error("Không thể tải danh sách lớp!");
    } finally {
      setIsLoading(false);
    }
  };

  const generateCode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      toast.error("Vui lòng nhập tên lớp!");
      return;
    }

    const weeksCount = parseInt(newWeeksCount) || 15;
    if (weeksCount < 1 || weeksCount > 52) {
      toast.error("Số tuần phải từ 1 đến 52!");
      return;
    }

    setIsCreating(true);
    try {
      const code = generateCode();
      const { data, error } = await supabase
        .from("classes")
        .insert({ name: newClassName.trim(), code, weeks_count: weeksCount })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return handleCreateClass();
        }
        throw error;
      }

      setClasses([data, ...classes]);
      setNewClassName("");
      setNewWeeksCount("15");
      toast.success(`Đã tạo lớp với mã: ${code}`);
    } catch (error) {
      console.error("Error creating class:", error);
      toast.error("Không thể tạo lớp!");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClass = async (classId: string, className: string) => {
    if (!confirm(`Bạn có chắc muốn xóa lớp "${className}"?`)) return;

    try {
      const { error } = await supabase
        .from("classes")
        .delete()
        .eq("id", classId);

      if (error) throw error;

      setClasses(classes.filter((c) => c.id !== classId));
      toast.success("Đã xóa lớp!");
    } catch (error) {
      console.error("Error deleting class:", error);
      toast.error("Không thể xóa lớp!");
    }
  };

  const handleStartAttendance = async (classId: string) => {
    const minutes = parseInt(timerMinutes);
    if (!minutes || minutes < 1 || minutes > 120) {
      toast.error("Thời gian phải từ 1 đến 120 phút!");
      return;
    }

    const week = parseInt(timerWeek);
    const classItem = classes.find(c => c.id === classId);
    if (!week || week < 1 || week > (classItem?.weeks_count || 15)) {
      toast.error(`Tuần phải từ 1 đến ${classItem?.weeks_count || 15}!`);
      return;
    }

    setIsGettingGPS(true);
    try {
      // Get admin's GPS position (average of multiple readings)
      toast.info("Đang lấy vị trí GPS...");
      const position = await getAveragePosition();
      
      // Generate a new code when starting attendance
      const newCode = generateCode();
      
      const { error } = await supabase
        .from("classes")
        .update({
          attendance_duration_minutes: minutes,
          attendance_started_at: new Date().toISOString(),
          code: newCode,
          admin_latitude: position.latitude,
          admin_longitude: position.longitude,
          current_week: week,
        })
        .eq("id", classId);

      if (error) throw error;

      setClasses(classes.map(c => 
        c.id === classId 
          ? { 
              ...c, 
              attendance_duration_minutes: minutes, 
              attendance_started_at: new Date().toISOString(),
              code: newCode,
              admin_latitude: position.latitude,
              admin_longitude: position.longitude,
              current_week: week,
            }
          : c
      ));
      setTimerClassId(null);
      setTimerMinutes("");
      setTimerWeek("1");
      toast.success(`Đã bật điểm danh tuần ${week} trong ${minutes} phút! Mã mới: ${newCode}`);
    } catch (error) {
      console.error("Error starting attendance:", error);
      const message = error instanceof Error ? error.message : "Không thể bật điểm danh!";
      toast.error(message);
    } finally {
      setIsGettingGPS(false);
    }
  };

  const handleStopAttendance = async (classId: string) => {
    try {
      const { error } = await supabase
        .from("classes")
        .update({
          attendance_duration_minutes: null,
          attendance_started_at: null,
        })
        .eq("id", classId);

      if (error) throw error;

      setClasses(classes.map(c => 
        c.id === classId 
          ? { ...c, attendance_duration_minutes: null, attendance_started_at: null }
          : c
      ));
      toast.success("Đã tắt điểm danh!");
    } catch (error) {
      console.error("Error stopping attendance:", error);
      toast.error("Không thể tắt điểm danh!");
    }
  };

  const isAttendanceActive = (classItem: ClassItem) => {
    if (!classItem.attendance_started_at || !classItem.attendance_duration_minutes) return false;
    const startTime = new Date(classItem.attendance_started_at).getTime();
    const endTime = startTime + classItem.attendance_duration_minutes * 60 * 1000;
    return Date.now() < endTime;
  };

  const getRemainingTime = (classItem: ClassItem) => {
    if (!classItem.attendance_started_at || !classItem.attendance_duration_minutes) return null;
    const startTime = new Date(classItem.attendance_started_at).getTime();
    const endTime = startTime + classItem.attendance_duration_minutes * 60 * 1000;
    const remaining = endTime - Date.now();
    if (remaining <= 0) return null;
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
    toast.success("Đã đăng xuất!");
  };

  const handleCopyCode = useCallback((classItem: ClassItem) => {
    setCopyCodeClass(classItem);
  }, []);

  // Refresh timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setClasses(prev => [...prev]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="w-full px-6 py-4 border-b bg-card flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Quản Trị Điểm Danh</h1>
            <p className="text-sm text-muted-foreground">Quản lý lớp học và điểm danh</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowCreateTeacher(true)} className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Tạo tài khoản GV
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowChangePassword(true)} className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Đổi mật khẩu
          </Button>
          <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-6xl mx-auto px-4 py-8">
        {/* Create Class Section */}
        <div className="card-elevated p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Tạo lớp mới
          </h2>
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Nhập tên lớp (VD: Lập trình Web - K66)"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="flex-1 min-w-[200px] input-modern"
              onKeyDown={(e) => e.key === "Enter" && handleCreateClass()}
            />
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                placeholder="Số tuần"
                value={newWeeksCount}
                onChange={(e) => setNewWeeksCount(e.target.value)}
                className="w-24 input-modern"
                min={1}
                max={52}
              />
              <span className="text-sm text-muted-foreground">tuần</span>
            </div>
            <Button
              onClick={handleCreateClass}
              disabled={isCreating}
              className="btn-primary-gradient px-6"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Tạo lớp
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Classes List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Danh sách lớp ({classes.length})
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : classes.length === 0 ? (
            <div className="card-elevated p-12 text-center">
              <BookOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Chưa có lớp nào. Hãy tạo lớp mới!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {classes.map((classItem) => (
                <div
                  key={classItem.id}
                  className="card-elevated p-5 cursor-pointer hover:shadow-xl transition-all duration-300 group"
                  onClick={() => setSelectedClass(classItem)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Weeks badge */}
                      <div className="px-2 py-1 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {classItem.weeks_count} tuần
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClass(classItem.id, classItem.name);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  
                  <h3 className="font-semibold text-foreground mb-2 line-clamp-1">
                    {classItem.name}
                  </h3>
                  
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCode(classItem);
                      }}
                    >
                      <span className="font-mono font-bold text-primary">{classItem.code}</span>
                      <Copy className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(classItem.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>

                  {/* Attendance Timer Section */}
                  <div className="pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                    {isAttendanceActive(classItem) ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-green-600">
                          <Clock className="w-4 h-4 animate-pulse" />
                          <span className="text-sm font-medium">
                            Tuần {classItem.current_week} - Còn {getRemainingTime(classItem)}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleStopAttendance(classItem.id)}
                        >
                          Tắt
                        </Button>
                      </div>
                    ) : timerClassId === classItem.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Tuần"
                            value={timerWeek}
                            onChange={(e) => setTimerWeek(e.target.value)}
                            className="w-16 h-8 text-sm"
                            min={1}
                            max={classItem.weeks_count}
                          />
                          <Input
                            type="number"
                            placeholder="Phút"
                            value={timerMinutes}
                            onChange={(e) => setTimerMinutes(e.target.value)}
                            className="w-16 h-8 text-sm"
                            min={1}
                            max={120}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleStartAttendance(classItem.id)}
                            className="btn-primary-gradient"
                            disabled={isGettingGPS}
                          >
                            {isGettingGPS ? (
                              <>
                                <MapPin className="w-3 h-3 mr-1 animate-pulse" />
                                GPS...
                              </>
                            ) : (
                              "Bắt đầu"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTimerClassId(null)}
                          >
                            Hủy
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tuần: 1-{classItem.weeks_count}, Thời gian: 1-120 phút
                        </p>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => setTimerClassId(classItem.id)}
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        Thời gian điểm danh
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Class Detail Modal */}
      {selectedClass && (
        <ClassDetailModal
          classInfo={selectedClass}
          onClose={() => {
            setSelectedClass(null);
            fetchClasses();
          }}
        />
      )}

      {/* Copy Code Modal */}
      {copyCodeClass && (
        <CopyCodeModal
          code={copyCodeClass.code}
          className={copyCodeClass.name}
          onClose={() => setCopyCodeClass(null)}
        />
      )}

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {/* Create Teacher Modal */}
      {showCreateTeacher && (
        <CreateTeacherModal onClose={() => setShowCreateTeacher(false)} />
      )}
    </div>
  );
};

export default Admin;
