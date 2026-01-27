import { useState, useCallback, useMemo, memo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, LogIn, CheckCircle, Loader2, MapPin } from "lucide-react";
import LoginModal from "@/components/LoginModal";
import useGPS, { calculateDistance } from "@/hooks/useGPS";

// Lazy load AttendanceForm for better initial load performance
const AttendanceForm = lazy(() => import("@/components/AttendanceForm"));

interface ClassData {
  id: string;
  name: string;
  weeks_count: number;
  attendance_duration_minutes: number | null;
  attendance_started_at: string | null;
  admin_latitude: number | null;
  admin_longitude: number | null;
  current_week: number | null;
}

const Index = () => {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [attendanceCode, setAttendanceCode] = useState("");
  const [verifiedClass, setVerifiedClass] = useState<ClassData | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCheckingGPS, setIsCheckingGPS] = useState(false);
  
  const { getAveragePosition } = useGPS();

  const handleVerifyCode = useCallback(async () => {
    if (attendanceCode.length !== 6) {
      toast.error("Mã điểm danh phải có 6 chữ số!");
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, weeks_count, attendance_duration_minutes, attendance_started_at, admin_latitude, admin_longitude, current_week")
        .eq("code", attendanceCode)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Check if attendance is still active
        if (data.attendance_started_at && data.attendance_duration_minutes) {
          const startTime = new Date(data.attendance_started_at).getTime();
          const endTime = startTime + data.attendance_duration_minutes * 60 * 1000;
          
          if (Date.now() > endTime) {
            toast.error("Mã điểm danh đã hết hiệu lực! Vui lòng liên hệ giảng viên.");
            return;
          }
        }
        
        // Check GPS if admin location is set
        if (data.admin_latitude && data.admin_longitude) {
          setIsCheckingGPS(true);
          try {
            toast.info("Đang xác minh vị trí của bạn...");
            const userPosition = await getAveragePosition();
            
            const distance = calculateDistance(
              data.admin_latitude,
              data.admin_longitude,
              userPosition.latitude,
              userPosition.longitude
            );
            
            // Max distance: 350m (between 300-400m)
            const MAX_DISTANCE = 350;
            
            if (distance > MAX_DISTANCE) {
              toast.error(`Bạn không ở gần giảng viên (cách ${Math.round(distance)}m). Vui lòng di chuyển lại gần và thử lại!`);
              return;
            }
            
            toast.success(`Vị trí hợp lệ (cách ${Math.round(distance)}m)`);
          } catch (gpsError) {
            console.error("GPS error:", gpsError);
            const message = gpsError instanceof Error ? gpsError.message : "Không thể xác minh vị trí";
            toast.error(message);
            return;
          } finally {
            setIsCheckingGPS(false);
          }
        }
        
        setVerifiedClass(data);
        toast.success(`Đã tìm thấy lớp: ${data.name}`);
      } else {
        toast.error("Mã điểm danh không tồn tại!");
      }
    } catch (error) {
      console.error("Error verifying code:", error);
      toast.error("Có lỗi xảy ra khi kiểm tra mã!");
    } finally {
      setIsVerifying(false);
    }
  }, [attendanceCode, getAveragePosition]);

  const handleAttendanceSuccess = useCallback(() => {
    setVerifiedClass(null);
    setAttendanceCode("");
    toast.success("Điểm danh thành công!");
  }, []);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setAttendanceCode(value);
  }, []);

  const handleCloseModal = useCallback(() => setVerifiedClass(null), []);

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <header className="w-full px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Hệ Thống Điểm Danh</h1>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowLogin(true)}
          className="flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          Đăng nhập
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center px-6 py-20">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Điểm Danh Nhanh Chóng
          </h2>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Nhập mã điểm danh 6 số được cung cấp bởi giảng viên để điểm danh
          </p>
        </div>

        {/* Code Input Section */}
        <div className="w-full max-w-md card-elevated p-8 animate-slide-up">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Nhập mã điểm danh</h3>
              <p className="text-sm text-muted-foreground">Mã gồm 6 chữ số</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Ví dụ: 123456"
              value={attendanceCode}
              onChange={handleCodeChange}
              className="input-modern text-center text-2xl tracking-widest font-mono"
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
            />
            <Button
              onClick={handleVerifyCode}
              disabled={attendanceCode.length !== 6 || isVerifying || isCheckingGPS}
              className="w-full btn-primary-gradient py-6 text-lg"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Đang kiểm tra...
                </>
              ) : isCheckingGPS ? (
                <>
                  <MapPin className="w-5 h-5 mr-2 animate-pulse" />
                  Đang xác minh vị trí...
                </>
              ) : (
                "Xác nhận mã"
              )}
            </Button>
          </div>
        </div>
      </main>

      {/* Login Modal */}
      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onSuccess={() => navigate("/admin")} />
      )}

      {/* Attendance Form Modal - Lazy Loaded */}
      {verifiedClass && (
        <Suspense fallback={
          <div className="modal-overlay animate-fade-in flex items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        }>
          <AttendanceForm
            classInfo={verifiedClass}
            onClose={handleCloseModal}
            onSuccess={handleAttendanceSuccess}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Index;