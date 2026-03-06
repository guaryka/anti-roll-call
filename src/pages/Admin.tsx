import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, BookOpen, Users, Loader2, Copy, Trash2, Calendar, Clock, MapPin, Shield } from "lucide-react";
import ClassDetailModal from "@/components/ClassDetailModal";
import CopyCodeModal from "@/components/CopyCodeModal";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import CreateTeacherModal from "@/components/CreateTeacherModal";
import AdminSettingsMenu from "@/components/AdminSettingsMenu";
import ProtectionPasswordModal from "@/components/ProtectionPasswordModal";
import SetProtectionPasswordModal from "@/components/SetProtectionPasswordModal";
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
  advanced_verification: boolean | null;
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
  const [showProtectionSettings, setShowProtectionSettings] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Protection password state
  const [isProtectionEnabled, setIsProtectionEnabled] = useState<boolean | null>(null);
  const [isProtectionVerified, setIsProtectionVerified] = useState(false);
  const [showProtectionModal, setShowProtectionModal] = useState(false);

  // Attendance timer state
  const [timerClassId, setTimerClassId] = useState<string | null>(null);
  const [timerMinutes, setTimerMinutes] = useState("");
  const [timerWeek, setTimerWeek] = useState("1");
  const [advancedVerification, setAdvancedVerification] = useState(false);
  const [isGettingGPS, setIsGettingGPS] = useState(false);

  const { getAveragePosition } = useGPS();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // Only fetch classes if protection is not enabled or is verified
    if (isProtectionEnabled === false || isProtectionVerified) {
      fetchClasses();
    }
  }, [isProtectionEnabled, isProtectionVerified]);

  const checkAuth = async () => {
    // Bỏ qua kiểm tra đăng nhập
    // const { data: { session } } = await supabase.auth.getSession();
    // if (!session) {
    //   navigate("/");
    //   toast.error("Vui lòng đăng nhập!");
    //   return;
    // }

    // const userEmail = session.user.email?.toLowerCase();
    setIsAdmin(true); // Mặc định cấp quyền admin

    // Check if protection password is enabled
    try {
      const { data, error } = await (supabase.rpc as any)("is_protection_password_enabled");
      if (error) throw error;
      setIsProtectionEnabled(data || false);
      if (data) {
        setShowProtectionModal(true);
      }
    } catch (error) {
      console.error("Check protection error:", error);
      setIsProtectionEnabled(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from("classes" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClasses((data as any[]) || []);
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
        .from("classes" as any)
        .insert({ name: newClassName.trim(), code, weeks_count: weeksCount })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return handleCreateClass();
        }
        throw error;
      }

      setClasses([data as any, ...classes]);
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
        .from("classes" as any)
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
      toast.info("Đang lấy vị trí GPS...");
      const position = await getAveragePosition();

      const newCode = generateCode();

      const { error } = await supabase
        .from("classes" as any)
        .update({
          attendance_duration_minutes: minutes,
          attendance_started_at: new Date().toISOString(),
          code: newCode,
          admin_latitude: position.latitude,
          admin_longitude: position.longitude,
          current_week: week,
          advanced_verification: advancedVerification,
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
            advanced_verification: advancedVerification,
          }
          : c
      ));
      setTimerClassId(null);
      setTimerMinutes("");
      setTimerWeek("1");
      setAdvancedVerification(false);
      const advancedText = advancedVerification ? " (Xác minh nâng cao)" : "";
      toast.success(`Đã bật điểm danh tuần ${week} trong ${minutes} phút${advancedText}! Mã mới: ${newCode}`);
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
        .from("classes" as any)
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

  // If protection is enabled and not verified, show protection modal
  if (isProtectionEnabled === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isProtectionEnabled && !isProtectionVerified) {
    return (
      <ProtectionPasswordModal
        onClose={() => {
          navigate("/");
          toast.info("Đã hủy xác thực");
        }}
        onVerified={() => {
          setIsProtectionVerified(true);
          setShowProtectionModal(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Mobile Optimized */}
      <header className="w-full px-3 md:px-6 py-3 md:py-4 border-b bg-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 md:w-6 md:h-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-bold text-foreground truncate">Quản Trị Điểm Danh</h1>
              <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">Quản lý lớp học</p>
            </div>
          </div>

          {/* Settings Menu */}
          <AdminSettingsMenu
            isAdmin={isAdmin}
            isMobile={true}
            onProtectionPassword={() => setShowProtectionSettings(true)}
            onCreateTeacher={() => setShowCreateTeacher(true)}
            onChangePassword={() => setShowChangePassword(true)}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-8">
        {/* Create Class Section */}
        <div className="card-elevated p-4 md:p-6 mb-4 md:mb-8">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 md:w-5 md:h-5" />
            Tạo lớp mới
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
            <Input
              placeholder="Nhập tên lớp"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="flex-1 input-modern text-sm md:text-base"
              onKeyDown={(e) => e.key === "Enter" && handleCreateClass()}
            />
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                type="number"
                placeholder="Tuần"
                value={newWeeksCount}
                onChange={(e) => setNewWeeksCount(e.target.value)}
                className="w-16 md:w-20 input-modern text-sm"
                min={1}
                max={52}
              />
              <span className="text-xs md:text-sm text-muted-foreground shrink-0">tuần</span>
              <Button
                onClick={handleCreateClass}
                disabled={isCreating}
                className="btn-primary-gradient px-4 md:px-6 shrink-0"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 md:mr-2" />
                    <span className="hidden md:inline">Tạo lớp</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Classes List */}
        <div className="space-y-3 md:space-y-4">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 md:w-5 md:h-5" />
            Danh sách lớp ({classes.length})
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : classes.length === 0 ? (
            <div className="card-elevated p-8 md:p-12 text-center">
              <BookOpen className="w-12 h-12 md:w-16 md:h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-sm md:text-base">Chưa có lớp nào. Hãy tạo lớp mới!</p>
            </div>
          ) : (
            <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((classItem) => (
                <div
                  key={classItem.id}
                  className="card-elevated p-4 md:p-5 cursor-pointer hover:shadow-xl transition-all duration-300 group"
                  onClick={() => setSelectedClass(classItem)}
                >
                  <div className="flex items-start justify-between mb-2 md:mb-3">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                    </div>
                    <div className="flex items-center gap-1 md:gap-2">
                      <div className="px-2 py-1 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {classItem.weeks_count}T
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClass(classItem.id, classItem.name);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-foreground mb-2 line-clamp-1 text-sm md:text-base">
                    {classItem.name}
                  </h3>

                  <div className="flex items-center justify-between mb-2 md:mb-3">
                    <div
                      className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCode(classItem);
                      }}
                    >
                      <span className="font-mono font-bold text-primary text-sm md:text-base">{classItem.code}</span>
                      <Copy className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(classItem.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </div>

                  {/* Attendance Timer Section */}
                  <div className="pt-2 md:pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                    {isAttendanceActive(classItem) ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 md:gap-2 text-green-600">
                          <Clock className="w-3 h-3 md:w-4 md:h-4 animate-pulse" />
                          <span className="text-xs md:text-sm font-medium">
                            T{classItem.current_week} - {getRemainingTime(classItem)}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 md:h-8 text-xs"
                          onClick={() => handleStopAttendance(classItem.id)}
                        >
                          Tắt
                        </Button>
                      </div>
                    ) : timerClassId === classItem.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 md:gap-2">
                          <Input
                            type="number"
                            placeholder="T"
                            value={timerWeek}
                            onChange={(e) => setTimerWeek(e.target.value)}
                            className="w-12 md:w-14 h-7 md:h-8 text-xs md:text-sm px-2"
                            min={1}
                            max={classItem.weeks_count}
                          />
                          <Input
                            type="number"
                            placeholder="Phút"
                            value={timerMinutes}
                            onChange={(e) => setTimerMinutes(e.target.value)}
                            className="w-14 md:w-16 h-7 md:h-8 text-xs md:text-sm px-2"
                            min={1}
                            max={120}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleStartAttendance(classItem.id)}
                            className="btn-primary-gradient h-7 md:h-8 text-xs px-2 md:px-3"
                            disabled={isGettingGPS}
                          >
                            {isGettingGPS ? (
                              <MapPin className="w-3 h-3 animate-pulse" />
                            ) : (
                              "Bắt đầu"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 md:h-8 text-xs px-2"
                            onClick={() => {
                              setTimerClassId(null);
                              setAdvancedVerification(false);
                            }}
                          >
                            Hủy
                          </Button>
                        </div>

                        {/* Advanced Verification Toggle */}
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
                            <Shield className="w-3.5 h-3.5 text-primary" />
                            <span>Nâng cao</span>
                          </Label>
                          <Switch
                            checked={advancedVerification}
                            onCheckedChange={setAdvancedVerification}
                            className="scale-75"
                          />
                        </div>
                        {advancedVerification && (
                          <p className="text-xs text-primary">
                            ✓ Yêu cầu xác minh khuôn mặt trước khi điểm danh
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Tuần: 1-{classItem.weeks_count}, Phút: 1-120
                        </p>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 md:h-9 text-xs md:text-sm"
                        onClick={() => setTimerClassId(classItem.id)}
                      >
                        <Clock className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                        Điểm danh
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {selectedClass && (
        <ClassDetailModal
          classInfo={selectedClass}
          onClose={() => {
            setSelectedClass(null);
            fetchClasses();
          }}
        />
      )}

      {copyCodeClass && (
        <CopyCodeModal
          code={copyCodeClass.code}
          className={copyCodeClass.name}
          onClose={() => setCopyCodeClass(null)}
        />
      )}

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {showCreateTeacher && (
        <CreateTeacherModal onClose={() => setShowCreateTeacher(false)} />
      )}

      {showProtectionSettings && (
        <SetProtectionPasswordModal onClose={() => setShowProtectionSettings(false)} />
      )}
    </div>
  );
};

export default Admin;
