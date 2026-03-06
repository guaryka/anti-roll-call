import { useState, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, LogIn, CheckCircle, Loader2, MapPin } from "lucide-react";
import LoginModal from "@/components/LoginModal";
import useGPS, { calculateDistance } from "@/hooks/useGPS";

// Lazy load heavy components
const AttendanceForm = lazy(() => import("@/components/AttendanceForm"));
const LocationMap = lazy(() => import("@/components/LocationMap"));

interface ClassData {
  id: string;
  name: string;
  weeks_count: number;
  attendance_duration_minutes: number | null;
  attendance_started_at: string | null;
  admin_latitude: number | null;
  admin_longitude: number | null;
  current_week: number | null;
  advanced_verification: boolean | null;
}

const Index = () => {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [attendanceCode, setAttendanceCode] = useState("");
  const [verifiedClass, setVerifiedClass] = useState<ClassData | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCheckingGPS, setIsCheckingGPS] = useState(false);

  interface MapData {
    adminLat: number; adminLng: number;
    userLat: number; userLng: number;
    distance: number; maxDistance: number;
    isInside: boolean;
  }
  const [mapData, setMapData] = useState<MapData | null>(null);

  const { getAveragePosition } = useGPS();

  const handleVerifyCode = useCallback(async () => {
    if (attendanceCode.length !== 6) {
      toast.error("Mã điểm danh phải có 6 chữ số!");
      return;
    }

    // ── 🚧 FAKE / TEST MODE ── xóa block này khi đã test xong ──────────────
    const FAKE_ADMIN_LAT = 10.7769;   // Hồ Chí Minh city center (lớp học)
    const FAKE_ADMIN_LNG = 106.7009;
    const FAKE_USER_LAT = 10.7780;   // cách ~150m (trong phạm vi)
    const FAKE_USER_LNG = 106.7022;
    const FAKE_DISTANCE = 150;
    const FAKE_MAX_DIST = 300;
    setMapData({
      adminLat: FAKE_ADMIN_LAT, adminLng: FAKE_ADMIN_LNG,
      userLat: FAKE_USER_LAT, userLng: FAKE_USER_LNG,
      distance: FAKE_DISTANCE, maxDistance: FAKE_MAX_DIST,
      isInside: FAKE_DISTANCE <= FAKE_MAX_DIST,
    });
    setVerifiedClass({
      id: "fake-class-id",
      name: "Lớp Test Demo",
      weeks_count: 10,
      attendance_duration_minutes: 60,
      attendance_started_at: new Date().toISOString(),
      admin_latitude: FAKE_ADMIN_LAT,
      admin_longitude: FAKE_ADMIN_LNG,
      current_week: 1,
      advanced_verification: false,
    });
    toast.success("🚧 Fake mode — map + modal đã mở!");
    return;
    // ── END FAKE ─────────────────────────────────────────────────────────────

    setIsVerifying(true);
    try {
      const { data, error } = await supabase
        .from("classes" as any)
        .select("id, name, weeks_count, attendance_duration_minutes, attendance_started_at, admin_latitude, admin_longitude, current_week, advanced_verification")
        .eq("code", attendanceCode)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const classData = data as any;
        // Check if attendance is still active
        if (classData.attendance_started_at && classData.attendance_duration_minutes) {
          const startTime = new Date(classData.attendance_started_at).getTime();
          const endTime = startTime + classData.attendance_duration_minutes * 60 * 1000;

          if (Date.now() > endTime) {
            toast.error("Mã điểm danh đã hết hiệu lực! Vui lòng liên hệ giảng viên.");
            return;
          }
        }

        // Check GPS if admin location is set
        if (classData.admin_latitude && classData.admin_longitude) {
          setIsCheckingGPS(true);
          try {
            toast.info("Đang xác minh vị trí của bạn...");
            const userPosition = await getAveragePosition();

            const MAX_DISTANCE = 300;
            const distance = calculateDistance(
              classData.admin_latitude,
              classData.admin_longitude,
              userPosition.latitude,
              userPosition.longitude
            );

            const isInside = distance <= MAX_DISTANCE;

            // Store map data to display
            setMapData({
              adminLat: classData.admin_latitude,
              adminLng: classData.admin_longitude,
              userLat: userPosition.latitude,
              userLng: userPosition.longitude,
              distance,
              maxDistance: MAX_DISTANCE,
              isInside,
            });

            if (!isInside) {
              toast.error(`Bạn ở ngoài phạm vi cho phép (cách ${Math.round(distance)}m, yêu cầu trong ${MAX_DISTANCE}m).`);
              return;
            }

            toast.success(`Vị trí hợp lệ — cách lớp ${Math.round(distance)}m ✓`);
          } catch (gpsError) {
            console.error("GPS error:", gpsError);
            const message = gpsError instanceof Error ? gpsError.message : "Không thể xác minh vị trí";
            toast.error(message);
            return;
          } finally {
            setIsCheckingGPS(false);
          }
        }

        setVerifiedClass(classData);
        toast.success(`Đã tìm thấy lớp: ${classData.name}`);
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
    setMapData(null); // reset map when code changes
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
      <main className="flex flex-col items-center px-6 pt-16 pb-24">
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

          {/* GPS Map Result — nằm trong card, bên dưới nút */}
          {mapData && (
            <div className={`mt-6 -mx-8 -mb-8 rounded-b-2xl overflow-hidden border-t animate-slide-up ${mapData.isInside ? "border-green-500/40" : "border-red-500/40"
              }`}>
              {/* Status bar */}
              <div className={`px-4 py-3 flex items-center justify-between ${mapData.isInside
                ? "bg-green-500/15 text-green-600"
                : "bg-red-500/15 text-red-600"
                }`}>
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <MapPin className="w-4 h-4" />
                  {mapData.isInside ? "Trong phạm vi cho phép" : "Ngoài phạm vi cho phép"}
                </div>
                <span className="text-xs font-mono bg-white/50 px-2 py-0.5 rounded-full">
                  {Math.round(mapData.distance)}m / {mapData.maxDistance}m
                </span>
              </div>

              {/* Map — bọc map-container để nhốt z-index của Leaflet */}
              <div className="map-container">
                <Suspense fallback={
                  <div className="h-[260px] flex items-center justify-center bg-muted">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                }>
                  <LocationMap
                    adminLat={mapData.adminLat}
                    adminLng={mapData.adminLng}
                    userLat={mapData.userLat}
                    userLng={mapData.userLng}
                    distance={mapData.distance}
                    maxDistance={mapData.maxDistance}
                  />
                </Suspense>
              </div>

              {/* Legend */}
              <div className="px-4 py-2 bg-background/80 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="text-base">🏫</span> Lớp học</span>
                <span className="flex items-center gap-1"><span className="text-base">📍</span> Vị trí của bạn</span>
                <span className="flex items-center gap-1">
                  <span className={`w-3 h-3 rounded-full border-2 ${mapData.isInside ? "border-green-500" : "border-red-500"
                    }`} />
                  Bán kính {mapData.maxDistance}m
                </span>
              </div>
            </div>
          )}
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
