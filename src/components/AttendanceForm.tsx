import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Camera, User, Hash, Users, Loader2, RefreshCw, Calendar, SwitchCamera, Star, Image as ImageIcon } from "lucide-react";
import { z } from "zod";
import { normalizeName, compareNames, compareStrings } from "@/lib/nameUtils";

const attendanceSchema = z.object({
  name: z.string().min(2, "Tên phải có ít nhất 2 ký tự").max(100, "Tên quá dài"),
  studentCode: z.string().min(1, "Vui lòng nhập mã sinh viên").max(20, "Mã sinh viên quá dài"),
  groupNumber: z.string().min(1, "Vui lòng nhập số nhóm").max(10, "Số nhóm quá dài"),
});

interface AttendanceFormProps {
  classInfo: { 
    id: string; 
    name: string; 
    weeks_count: number;
    current_week?: number | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
}

// Memoized input component for better performance
const MemoInput = memo(({ 
  value, 
  onChange, 
  placeholder, 
  className, 
  type = "text",
  min,
  max,
  disabled,
  readOnly,
}: { 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  className?: string;
  type?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  readOnly?: boolean;
}) => (
  <Input
    type={type}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    className={className}
    min={min}
    max={max}
    disabled={disabled}
    readOnly={readOnly}
  />
));

const AttendanceForm = ({ classInfo, onClose, onSuccess }: AttendanceFormProps) => {
  const [name, setName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [groupNumber, setGroupNumber] = useState("");
  const [weekNumber, setWeekNumber] = useState(classInfo.current_week?.toString() || "1");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  
  // Bonus points
  const [hasBonusPoints, setHasBonusPoints] = useState(false);
  const [bonusPoints, setBonusPoints] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Use admin-set week as default (cannot be changed by student)
  const defaultWeek = classInfo.current_week || 1;

  useEffect(() => {
    fetchStudents();
    return () => {
      // Cleanup camera on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [classInfo.id]);

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("class_id", classInfo.id);
      
      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const startCamera = useCallback(async (facing: "user" | "environment" = facingMode) => {
    setIsCameraLoading(true);
    
    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().then(() => resolve()).catch(() => resolve());
            };
          }
        });
      }
      
      setIsCameraActive(true);
      setFacingMode(facing);
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("Không thể truy cập camera. Vui lòng cho phép quyền truy cập camera.");
    } finally {
      setIsCameraLoading(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const switchCamera = useCallback(() => {
    const newFacing = facingMode === "user" ? "environment" : "user";
    startCamera(newFacing);
  }, [facingMode, startCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      toast.error("Camera chưa sẵn sàng, vui lòng thử lại!");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      // Mirror image if using front camera
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setPhotoData(dataUrl);
      stopCamera();
      toast.success("Đã chụp ảnh!");
    }
  }, [facingMode, stopCamera]);

  const retakePhoto = useCallback(() => {
    setPhotoData(null);
    startCamera();
  }, [startCamera]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Vui lòng chọn file ảnh!");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          setPhotoData(result);
          stopCamera();
          toast.success("Đã chọn ảnh từ máy!");
        }
      };
      reader.onerror = () => {
        toast.error("Không thể đọc file ảnh, vui lòng thử lại!");
      };
      reader.readAsDataURL(file);
    },
    [stopCamera]
  );

  const validateStudentInList = (): boolean => {
    // If no students in the class list, allow anyone to attend
    if (students.length === 0) return true;

    // Normalize input name
    const normalizedInputName = normalizeName(name);
    
    // Check if student exists in the list
    // Use compareNames for name comparison (handles Unicode normalization)
    // Use compareStrings for student code and group number
    const studentExists = students.some(
      (s) =>
        compareStrings(s.student_code, studentCode) &&
        compareNames(s.name, normalizedInputName) &&
        compareStrings(s.group_number, groupNumber)
    );

    return studentExists;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Normalize name before validation
    const normalizedName = normalizeName(name);

    // Validate
    const result = attendanceSchema.safeParse({ name: normalizedName, studentCode, groupNumber });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Validate week number
    const week = defaultWeek;
    if (!week || week < 1 || week > classInfo.weeks_count) {
      toast.error(`Tuần phải từ 1 đến ${classInfo.weeks_count}!`);
      return;
    }

    if (!photoData) {
      toast.error("Vui lòng chụp ảnh điểm danh!");
      return;
    }

    // Validate student is in the list
    if (students.length > 0 && !validateStudentInList()) {
      toast.error("Không có tên trong danh sách! Vui lòng liên hệ giảng viên.");
      return;
    }

    // Validate bonus points if enabled
    const bonusPointsValue = hasBonusPoints && bonusPoints ? parseInt(bonusPoints) : 0;
    if (hasBonusPoints && bonusPoints && (isNaN(bonusPointsValue) || bonusPointsValue < 0)) {
      toast.error("Điểm cộng không hợp lệ!");
      return;
    }

    setIsLoading(true);

    try {
      // Compress photo for faster upload on slow networks
      const blob = await fetch(photoData).then(r => r.blob());
      
      // Use smaller file size for faster upload
      const compressedBlob = new Blob([blob], { type: "image/jpeg" });
      const fileName = `${classInfo.id}/${Date.now()}_${studentCode}.jpg`;
      
      // Upload with retry logic for unstable networks
      let uploadError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.storage
          .from("attendance-photos")
          .upload(fileName, compressedBlob, { 
            contentType: "image/jpeg",
            cacheControl: "3600",
          });
        
        if (!error) {
          uploadError = null;
          break;
        }
        uploadError = error;
        // Wait before retry
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("attendance-photos")
        .getPublicUrl(fileName);

      // Save attendance record with retry
      let insertError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase
          .from("attendance_records")
          .insert({
            class_id: classInfo.id,
            name: normalizedName, // Use normalized name
            student_code: studentCode,
            group_number: groupNumber,
            photo_url: publicUrl,
            week_number: week,
            bonus_points: bonusPointsValue,
          });
        
        if (!error) {
          insertError = null;
          break;
        }
        insertError = error;
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }

      if (insertError) throw insertError;

      onSuccess();
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("Có lỗi xảy ra khi lưu điểm danh! Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={handleClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="modal-content w-full max-w-lg p-6 md:p-8 animate-scale-in max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">Điểm Danh</h2>
              <p className="text-sm text-muted-foreground">Lớp: {classInfo.name}</p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoadingStudents ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Camera Section */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Ảnh điểm danh
                </Label>
                
                <div className="relative aspect-[4/3] bg-muted rounded-xl overflow-hidden">
                  {photoData ? (
                    <img
                      src={photoData}
                      alt="Captured"
                      className="w-full h-full object-cover"
                    />
                  ) : isCameraActive ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
                      />
                      {isCameraLoading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-white" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <Camera className="w-12 h-12 mb-2" />
                      <p>Chưa có ảnh</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                  {photoData ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={retakePhoto}
                      className="flex-1"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Chụp lại
                    </Button>
                  ) : isCameraActive ? (
                    <>
                      <Button
                        type="button"
                        onClick={switchCamera}
                        variant="outline"
                        className="shrink-0"
                        disabled={isCameraLoading}
                      >
                        <SwitchCamera className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        onClick={capturePhoto}
                        className="flex-1 btn-primary-gradient"
                        disabled={isCameraLoading}
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Chụp ảnh
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => startCamera()}
                      className="flex-1"
                      variant="outline"
                      disabled={isCameraLoading}
                    >
                      {isCameraLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4 mr-2" />
                      )}
                      Mở camera
                    </Button>
                  )}
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Chọn ảnh từ máy
                    </Button>
                  </div>
                </div>
              </div>

              {/* Name Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Họ và tên
                </Label>
                <Input
                  placeholder="Nguyễn Văn A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-modern"
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
              </div>

              {/* Student Code Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Mã sinh viên
                </Label>
                <Input
                  placeholder="VD: SV001"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  className="input-modern"
                />
                {errors.studentCode && <p className="text-sm text-destructive">{errors.studentCode}</p>}
              </div>

              {/* Group Number Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Số nhóm
                </Label>
                <Input
                  placeholder="VD: 1"
                  value={groupNumber}
                  onChange={(e) => setGroupNumber(e.target.value)}
                  className="input-modern"
                />
                {errors.groupNumber && <p className="text-sm text-destructive">{errors.groupNumber}</p>}
              </div>

              {/* Week Number Display (Read-only) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Tuần thứ
                </Label>
                <Input
                  type="number"
                  value={defaultWeek}
                  readOnly
                  disabled
                  className="input-modern bg-muted"
                />
                <p className="text-xs text-muted-foreground">Tuần được đặt bởi giảng viên</p>
              </div>

              {/* Bonus Points Toggle */}
              <div className="space-y-3 p-4 bg-muted/50 rounded-xl">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <Star className="w-4 h-4 text-yellow-500" />
                    Điểm cộng
                  </Label>
                  <Switch
                    checked={hasBonusPoints}
                    onCheckedChange={setHasBonusPoints}
                  />
                </div>
                {hasBonusPoints && (
                  <Input
                    type="number"
                    placeholder="Nhập số điểm cộng"
                    value={bonusPoints}
                    onChange={(e) => setBonusPoints(e.target.value)}
                    className="input-modern"
                    min={0}
                    max={100}
                  />
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full btn-primary-gradient py-6 text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  "Lưu điểm danh"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceForm;
