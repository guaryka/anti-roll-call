import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Camera, User, Hash, Users, Loader2, RefreshCw, Calendar, Star, Shield, CheckCircle, Upload } from "lucide-react";

import { z } from "zod";
import { normalizeName, compareNames, compareStrings } from "@/lib/nameUtils";
import LivenessVerification from "./LivenessVerification";

const attendanceSchema = z.object({
  name: z.string().min(2, "Tên phải có ít nhất 2 ký tự").max(100, "Tên quá dài"),
  studentCode: z.string().min(1, "Vui lòng nhập mã sinh viên").max(20, "Mã sinh viên quá dài").regex(/^\d+$/, "Mã sinh viên chỉ được nhập số"),
  groupNumber: z.string().min(1, "Vui lòng nhập số nhóm").max(10, "Số nhóm quá dài").regex(/^\d+$/, "Số nhóm chỉ được nhập số"),
});

interface AttendanceFormProps {
  classInfo: {
    id: string;
    name: string;
    weeks_count: number;
    current_week?: number | null;
    advanced_verification?: boolean | null;
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

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [studentNotFoundError, setStudentNotFoundError] = useState<string | null>(null);

  // Bonus points
  const [hasBonusPoints, setHasBonusPoints] = useState(false);
  const [bonusPoints, setBonusPoints] = useState("");

  // Advanced verification
  const [showLivenessVerification, setShowLivenessVerification] = useState(false);
  const [isLivenessVerified, setIsLivenessVerified] = useState(false);
  const requiresVerification = classInfo.advanced_verification === true;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        .from("students" as any)
        .select("*")
        .eq("class_id", classInfo.id);

      if (error) throw error;
      setStudents((data as any[]) || []);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const startCamera = useCallback(async () => {
    setIsCameraLoading(true);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;

      if (!videoRef.current) {
        setIsCameraLoading(false);
        return;
      }

      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = async () => {
        try {
          await video.play(); // 🔥 PHẢI await
          setIsCameraActive(true);
        } catch (e) {
          toast.error("Trình duyệt chặn camera. Vui lòng bấm lại.");
        } finally {
          setIsCameraLoading(false);
        }
      };
    } catch (err) {
      toast.error("Không thể mở camera. Vui lòng kiểm tra quyền.");
      setIsCameraLoading(false);
    }
  }, []);



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
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setPhotoData(dataUrl);
      stopCamera();
      toast.success("Đã chụp ảnh!");
    }
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setPhotoData(null);
    startCamera();
  }, [startCamera]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh hợp lệ!");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ảnh quá lớn! Vui lòng chọn ảnh dưới 10MB.");
      return;
    }

    stopCamera();

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      // Resize/compress via canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1280;
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setPhotoData(canvas.toDataURL("image/jpeg", 0.85));
          toast.success("Đã tải ảnh lên!");
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
  }, [stopCamera]);

  const validateStudentInList = (): { valid: boolean; error?: string } => {
    // If no students in the class list, allow anyone to attend
    if (students.length === 0) {
      return { valid: true };
    }

    // Normalize input values
    const normalizedInputName = normalizeName(name);
    const normalizedStudentCode = studentCode.trim();
    const normalizedGroupNumber = groupNumber.trim();

    // Validation: All fields must be filled
    if (!normalizedInputName || !normalizedStudentCode || !normalizedGroupNumber) {
      return { valid: false, error: "Vui lòng điền đầy đủ thông tin" };
    }

    // Check if ALL three fields match exactly with any student in the list  
    // If ANY field doesn't match (name OR code OR group), reject
    const matchingStudent = students.find((s) => {
      const nameMatch = compareNames(s.name, normalizedInputName);
      const codeMatch = compareStrings(s.student_code, normalizedStudentCode);
      const groupMatch = compareStrings(s.group_number, normalizedGroupNumber);

      // All three fields must match exactly
      return nameMatch && codeMatch && groupMatch;
    });

    if (!matchingStudent) {
      // Additional debugging: Check what's not matching
      const partialMatch = students.find((s) => {
        return compareStrings(s.student_code, normalizedStudentCode);
      });

      if (partialMatch) {
        // Student code exists but other fields don't match
        const nameMatches = compareNames(partialMatch.name, normalizedInputName);
        const groupMatches = compareStrings(partialMatch.group_number, normalizedGroupNumber);

        if (!nameMatches && !groupMatches) {
          return {
            valid: false,
            error: "Bạn không có tên trong lớp. Vui lòng liên hệ giảng viên."
          };
        } else if (!nameMatches) {
          return {
            valid: false,
            error: "Bạn không có tên trong lớp. Vui lòng liên hệ giảng viên."
          };
        } else if (!groupMatches) {
          return {
            valid: false,
            error: "Bạn không có tên trong lớp. Vui lòng liên hệ giảng viên."
          };
        }
      }

      return {
        valid: false,
        error: "Bạn không có tên trong lớp. Vui lòng liên hệ giảng viên."
      };
    }

    return { valid: true };
  };

  // Real-time validation when any field changes
  useEffect(() => {
    // Only validate if there are students in the list and all fields have values
    if (students.length === 0) {
      setStudentNotFoundError(null);
      return;
    }

    const normalizedInputName = normalizeName(name);
    const normalizedStudentCode = studentCode.trim();
    const normalizedGroupNumber = groupNumber.trim();

    // Start validation when at least one field has value
    if (!normalizedInputName && !normalizedStudentCode && !normalizedGroupNumber) {
      setStudentNotFoundError(null);
      return;
    }

    // If not all fields filled, don't show error yet but don't clear it either
    if (!normalizedInputName || !normalizedStudentCode || !normalizedGroupNumber) {
      // Show error only if some fields are filled but not all
      if (normalizedInputName || normalizedStudentCode || normalizedGroupNumber) {
        // Check partial match to give early feedback
        const hasAnyMatch = students.some((s) => {
          const nameMatch = normalizedInputName ? compareNames(s.name, normalizedInputName) : true;
          const codeMatch = normalizedStudentCode ? compareStrings(s.student_code, normalizedStudentCode) : true;
          const groupMatch = normalizedGroupNumber ? compareStrings(s.group_number, normalizedGroupNumber) : true;

          // Check if filled fields match
          if (normalizedInputName && !compareNames(s.name, normalizedInputName)) return false;
          if (normalizedStudentCode && !compareStrings(s.student_code, normalizedStudentCode)) return false;
          if (normalizedGroupNumber && !compareStrings(s.group_number, normalizedGroupNumber)) return false;

          return true;
        });

        if (!hasAnyMatch && (normalizedInputName || normalizedStudentCode || normalizedGroupNumber)) {
          setStudentNotFoundError("Bạn không có tên trong lớp. Vui lòng liên hệ giảng viên.");
        } else {
          setStudentNotFoundError(null);
        }
      }
      return;
    }

    // Check for exact match
    const matchingStudent = students.find((s) => {
      const nameMatch = compareNames(s.name, normalizedInputName);
      const codeMatch = compareStrings(s.student_code, normalizedStudentCode);
      const groupMatch = compareStrings(s.group_number, normalizedGroupNumber);
      return nameMatch && codeMatch && groupMatch;
    });

    if (!matchingStudent) {
      setStudentNotFoundError("Bạn không có tên trong lớp. Vui lòng liên hệ giảng viên.");
    } else {
      setStudentNotFoundError(null);
    }
  }, [name, studentCode, groupNumber, students]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setStudentNotFoundError(null);

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

    // Validate student is in the list - check if ANY field doesn't match
    const validationResult = validateStudentInList();
    if (!validationResult.valid) {
      const errorMsg = validationResult.error || "Bạn không có tên trong lớp. Vui lòng liên hệ giảng viên.";
      setStudentNotFoundError(errorMsg);
      toast.error(errorMsg);
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
          .from("attendance_records" as any)
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
                  {/* VIDEO LUÔN RENDER */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover scale-x-[-1] ${isCameraActive ? "block" : "hidden"
                      }`}
                  />

                  {/* ẢNH SAU KHI CHỤP */}
                  {photoData && (
                    <img
                      src={photoData}
                      alt="Captured"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}

                  {/* TRẠNG THÁI CHƯA MỞ CAMERA */}
                  {!isCameraActive && !photoData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                      <Camera className="w-12 h-12 mb-2" />
                      <p>Chưa có ảnh</p>
                    </div>
                  )}

                  {/* LOADING */}
                  {isCameraLoading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-white" />
                    </div>
                  )}
                </div>


                <div className="flex gap-2">
                  {photoData ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={retakePhoto}
                        className="flex-1"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Chụp lại
                      </Button>
                      {/* Show verify button if advanced verification is required and not yet verified */}
                      {requiresVerification && !isLivenessVerified && (
                        <Button
                          type="button"
                          onClick={() => setShowLivenessVerification(true)}
                          className="flex-1 btn-primary-gradient"
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Xác minh
                        </Button>
                      )}
                    </>
                  ) : isCameraActive ? (
                    <>

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
                    <>
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
                        Chụp ảnh
                      </Button>
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1"
                        variant="outline"
                        disabled={isCameraLoading}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Tải ảnh lên
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </>
                  )}
                </div>

                {/* Advanced Verification Status */}
                {requiresVerification && (
                  <div className={`p-3 rounded-xl flex items-center gap-2 ${isLivenessVerified
                      ? "bg-green-500/10 text-green-600"
                      : "bg-amber-500/10 text-amber-600"
                    }`}>
                    {isLivenessVerified ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Đã xác minh danh tính</span>
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5" />
                        <span className="text-sm">Chụp ảnh và bấm "Xác minh" để tiếp tục</span>
                      </>
                    )}
                  </div>
                )}
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
                  disabled={requiresVerification && !isLivenessVerified}
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
                  placeholder="VD: 123456"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value.replace(/\D/g, ""))}
                  className="input-modern"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={requiresVerification && !isLivenessVerified}
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
                  onChange={(e) => setGroupNumber(e.target.value.replace(/\D/g, ""))}
                  className="input-modern"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={requiresVerification && !isLivenessVerified}
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
                    <Star className="w-4 h-4 text-amber-500" />
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

              {/* Student Not Found Error */}
              {studentNotFoundError && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
                  <p className="text-sm text-destructive font-medium text-center">
                    {studentNotFoundError}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading || (requiresVerification && !isLivenessVerified) || !!studentNotFoundError || !name.trim() || !studentCode.trim() || !groupNumber.trim() || !photoData}
                className="w-full btn-primary-gradient py-6 text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Đang lưu...
                  </>
                ) : requiresVerification && !isLivenessVerified ? (
                  "Vui lòng xác minh danh tính trước"
                ) : studentNotFoundError ? (
                  "Không thể lưu điểm danh"
                ) : !name.trim() || !studentCode.trim() || !groupNumber.trim() ? (
                  "Vui lòng điền đầy đủ thông tin"
                ) : !photoData ? (
                  "Vui lòng chụp ảnh điểm danh"
                ) : (
                  "Lưu điểm danh"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Liveness Verification Modal */}
      {showLivenessVerification && photoData && (
        <LivenessVerification
          referencePhotoUrl={photoData}
          onVerified={() => {
            setIsLivenessVerified(true);
            setShowLivenessVerification(false);
            toast.success("Xác minh danh tính thành công!");
          }}
          onCancel={() => setShowLivenessVerification(false)}
        />
      )}
    </div>
  );
};

export default AttendanceForm;
