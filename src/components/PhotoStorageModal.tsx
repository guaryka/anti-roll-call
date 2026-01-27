import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  X, 
  FolderOpen, 
  Image as ImageIcon, 
  Loader2, 
  ScanFace,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Users,
  ImageOff,
  CheckCircle
} from "lucide-react";
import PhotoViewModal from "@/components/PhotoViewModal";
import * as faceapi from "@vladmandic/face-api";

interface ClassInfo {
  id: string;
  name: string;
  weeks_count: number;
}

interface AttendanceRecord {
  id: string;
  name: string;
  student_code: string;
  group_number: string;
  photo_url: string;
  created_at: string;
  week_number: number;
}

interface DuplicateReport {
  photo1: AttendanceRecord;
  photo2: AttendanceRecord;
  similarity: number;
}

interface NoFaceReport {
  record: AttendanceRecord;
}

interface UserMismatchReport {
  studentCode: string;
  studentName: string;
  mismatchedWeeks: number[];
  matchedWeeks: number[];
  totalWeeks: number;
  photos: { week: number; url: string; matched: boolean }[];
}

interface PhotoStorageModalProps {
  classInfo: ClassInfo;
  onClose: () => void;
}

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

// Batch processing for performance
const BATCH_SIZE = 10;

const PhotoStorageModal = ({ classInfo, onClose }: PhotoStorageModalProps) => {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningUsers, setIsScanningUsers] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [duplicates, setDuplicates] = useState<DuplicateReport[]>([]);
  const [noFacePhotos, setNoFacePhotos] = useState<NoFaceReport[]>([]);
  const [userMismatches, setUserMismatches] = useState<UserMismatchReport[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showNoFace, setShowNoFace] = useState(false);
  const [showUserMismatches, setShowUserMismatches] = useState(false);
  const [selectedMismatchUser, setSelectedMismatchUser] = useState<UserMismatchReport | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadModels();
    fetchAttendanceRecords();
  }, [classInfo.id]);

  const loadModels = async () => {
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      setModelsLoaded(true);
    } catch (error) {
      console.error("Error loading face-api models:", error);
      toast.error("Không thể tải mô hình nhận diện khuôn mặt!");
    }
  };

  const fetchAttendanceRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("class_id", classInfo.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAttendanceRecords(data || []);
    } catch (error) {
      console.error("Error fetching attendance records:", error);
      toast.error("Không thể tải dữ liệu điểm danh!");
    } finally {
      setIsLoading(false);
    }
  };

  const getPhotosByWeek = useCallback((week: number) => {
    return attendanceRecords.filter(
      (record) => record.week_number === week && record.photo_url
    );
  }, [attendanceRecords]);

  const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  const getBestFace = async (img: HTMLImageElement) => {
    const detections = await faceapi
      .detectAllFaces(img)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) return null;

    // Select the largest (clearest) face
    let bestDetection = detections[0];
    let maxArea = bestDetection.detection.box.width * bestDetection.detection.box.height;

    for (const detection of detections) {
      const area = detection.detection.box.width * detection.detection.box.height;
      if (area > maxArea) {
        maxArea = area;
        bestDetection = detection;
      }
    }

    // Filter out small faces (less than 50x50 pixels)
    if (bestDetection.detection.box.width < 50 || bestDetection.detection.box.height < 50) {
      return null;
    }

    return bestDetection;
  };

  const compareFaces = (descriptor1: Float32Array, descriptor2: Float32Array): number => {
    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
    // Convert distance to similarity (0-1)
    const similarity = 1 - Math.min(distance, 1);
    return similarity;
  };

  // Process images in batches for better performance
  const processBatch = async (
    records: AttendanceRecord[],
    startIdx: number
  ): Promise<{ record: AttendanceRecord; descriptor: Float32Array | null }[]> => {
    const batch = records.slice(startIdx, startIdx + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (record) => {
        try {
          const img = await loadImageFromUrl(record.photo_url);
          const bestFace = await getBestFace(img);
          return {
            record,
            descriptor: bestFace ? bestFace.descriptor : null,
          };
        } catch (error) {
          console.error(`Error processing image for ${record.name}:`, error);
          return { record, descriptor: null };
        }
      })
    );
    return results;
  };

  const handleScanAllPhotos = async () => {
    if (!modelsLoaded) {
      toast.error("Đang tải mô hình, vui lòng đợi...");
      return;
    }

    const weekPhotos = getPhotosByWeek(selectedWeek);
    if (weekPhotos.length < 1) {
      toast.info("Cần ít nhất 1 ảnh để quét!");
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    setDuplicates([]);
    setNoFacePhotos([]);

    const faceDescriptors: { record: AttendanceRecord; descriptor: Float32Array }[] = [];
    const noFaceList: NoFaceReport[] = [];
    const foundDuplicates: DuplicateReport[] = [];

    try {
      // Process in batches for better performance
      const totalBatches = Math.ceil(weekPhotos.length / BATCH_SIZE);
      
      for (let i = 0; i < weekPhotos.length; i += BATCH_SIZE) {
        const batchResults = await processBatch(weekPhotos, i);
        
        for (const result of batchResults) {
          if (result.descriptor) {
            faceDescriptors.push({
              record: result.record,
              descriptor: result.descriptor,
            });
          } else {
            noFaceList.push({ record: result.record });
          }
        }
        
        setScanProgress(Math.round(((i + BATCH_SIZE) / weekPhotos.length) * 50));
      }

      // Compare all pairs
      const totalComparisons = (faceDescriptors.length * (faceDescriptors.length - 1)) / 2;
      let comparisonsDone = 0;

      for (let i = 0; i < faceDescriptors.length; i++) {
        for (let j = i + 1; j < faceDescriptors.length; j++) {
          const similarity = compareFaces(
            faceDescriptors[i].descriptor,
            faceDescriptors[j].descriptor
          );

          comparisonsDone++;
          if (comparisonsDone % 50 === 0) {
            setScanProgress(50 + Math.round((comparisonsDone / totalComparisons) * 50));
          }

          // Threshold: 0.6 similarity (distance < 0.4) indicates same person
          if (similarity > 0.6) {
            foundDuplicates.push({
              photo1: faceDescriptors[i].record,
              photo2: faceDescriptors[j].record,
              similarity: similarity,
            });
          }
        }
      }

      setDuplicates(foundDuplicates);
      setNoFacePhotos(noFaceList);
      
      // Show appropriate messages
      const messages: string[] = [];
      if (foundDuplicates.length > 0) {
        messages.push(`${foundDuplicates.length} cặp ảnh trùng`);
        setShowDuplicates(true);
      }
      if (noFaceList.length > 0) {
        messages.push(`${noFaceList.length} ảnh không có khuôn mặt`);
        setShowNoFace(true);
      }
      
      if (messages.length > 0) {
        toast.warning(`Phát hiện: ${messages.join(", ")}!`);
      } else {
        toast.success("Không phát hiện vấn đề nào!");
      }
    } catch (error) {
      console.error("Error scanning photos:", error);
      toast.error("Có lỗi xảy ra khi quét ảnh!");
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // Scan user across all weeks - also detect photos without faces
  const handleScanUsers = async () => {
    if (!modelsLoaded) {
      toast.error("Đang tải mô hình, vui lòng đợi...");
      return;
    }

    const allPhotos = attendanceRecords.filter(r => r.photo_url);
    if (allPhotos.length < 1) {
      toast.info("Cần ít nhất 1 ảnh để quét!");
      return;
    }

    setIsScanningUsers(true);
    setScanProgress(0);
    setUserMismatches([]);
    setNoFacePhotos([]);

    try {
      // Group photos by student
      const photosByStudent = new Map<string, AttendanceRecord[]>();
      for (const record of allPhotos) {
        const key = record.student_code.toLowerCase();
        if (!photosByStudent.has(key)) {
          photosByStudent.set(key, []);
        }
        photosByStudent.get(key)!.push(record);
      }

      const mismatches: UserMismatchReport[] = [];
      const noFaceList: NoFaceReport[] = [];
      const studentKeys = Array.from(photosByStudent.keys());
      let processedStudents = 0;

      for (const studentCode of studentKeys) {
        const studentPhotos = photosByStudent.get(studentCode)!;
        
        // Get face descriptors for this student's photos
        const descriptors: { week: number; descriptor: Float32Array; url: string }[] = [];
        
        for (const record of studentPhotos) {
          try {
            const img = await loadImageFromUrl(record.photo_url);
            const bestFace = await getBestFace(img);
            if (bestFace) {
              descriptors.push({
                week: record.week_number,
                descriptor: bestFace.descriptor,
                url: record.photo_url,
              });
            } else {
              // No face detected - add to report
              noFaceList.push({ record });
            }
          } catch (error) {
            console.error(`Error processing image:`, error);
          }
        }

        // Compare all photos of this student (only if 2+ with faces)
        if (descriptors.length >= 2) {
          const mismatchedWeeks: number[] = [];
          const matchedWeeks: number[] = [descriptors[0].week]; // Base week is always matched
          const baseDescriptor = descriptors[0];

          for (let i = 1; i < descriptors.length; i++) {
            const similarity = compareFaces(baseDescriptor.descriptor, descriptors[i].descriptor);
            // Lower threshold for same person detection (0.5 = more strict)
            if (similarity < 0.5) {
              mismatchedWeeks.push(descriptors[i].week);
            } else {
              matchedWeeks.push(descriptors[i].week);
            }
          }

          if (mismatchedWeeks.length > 0) {
            // Build photos array with matched status
            const photos = descriptors.map(d => ({
              week: d.week,
              url: d.url,
              matched: !mismatchedWeeks.includes(d.week),
            }));
            
            mismatches.push({
              studentCode: studentPhotos[0].student_code,
              studentName: studentPhotos[0].name,
              mismatchedWeeks,
              matchedWeeks,
              totalWeeks: studentPhotos.length,
              photos,
            });
          }
        }

        processedStudents++;
        setScanProgress(Math.round((processedStudents / studentKeys.length) * 100));
      }

      setUserMismatches(mismatches);
      setNoFacePhotos(noFaceList);
      
      // Show appropriate messages
      const messages: string[] = [];
      if (mismatches.length > 0) {
        messages.push(`${mismatches.length} sinh viên có ảnh không khớp`);
        setShowUserMismatches(true);
      }
      if (noFaceList.length > 0) {
        messages.push(`${noFaceList.length} ảnh không có khuôn mặt`);
        setShowNoFace(true);
      }
      
      if (messages.length > 0) {
        toast.warning(`Phát hiện: ${messages.join(", ")}!`);
      } else {
        toast.success("Tất cả sinh viên đều có ảnh khớp nhau và có khuôn mặt!");
      }
    } catch (error) {
      console.error("Error scanning users:", error);
      toast.error("Có lỗi xảy ra khi quét người dùng!");
    } finally {
      setIsScanningUsers(false);
      setScanProgress(0);
    }
  };

  const weekPhotos = getPhotosByWeek(selectedWeek);

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="fixed inset-4 md:inset-8 bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-6 border-b bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Kho lưu trữ ảnh</h2>
              <p className="text-sm text-muted-foreground">{classInfo.name}</p>
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
        <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6">
          {/* Week selector */}
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
                disabled={selectedWeek === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: classInfo.weeks_count }, (_, i) => i + 1).map((week) => (
                <Button
                  key={week}
                  size="sm"
                  variant={selectedWeek === week ? "default" : "outline"}
                  onClick={() => {
                    setSelectedWeek(week);
                    setShowDuplicates(false);
                    setShowNoFace(false);
                    setDuplicates([]);
                    setNoFacePhotos([]);
                  }}
                  className="min-w-[48px]"
                >
                  Tuần {week}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedWeek(Math.min(classInfo.weeks_count, selectedWeek + 1))}
                disabled={selectedWeek === classInfo.weeks_count}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Scan buttons */}
          <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">
              {weekPhotos.length} ảnh trong tuần {selectedWeek}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Report buttons */}
              {duplicates.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDuplicates(!showDuplicates)}
                  className="text-orange-600 border-orange-300"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  {duplicates.length} trùng lặp
                </Button>
              )}
              {noFacePhotos.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNoFace(!showNoFace)}
                  className="text-red-600 border-red-300"
                >
                  <ImageOff className="w-4 h-4 mr-2" />
                  {noFacePhotos.length} không có mặt
                </Button>
              )}
              {userMismatches.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUserMismatches(!showUserMismatches)}
                  className="text-purple-600 border-purple-300"
                >
                  <Users className="w-4 h-4 mr-2" />
                  {userMismatches.length} không khớp
                </Button>
              )}
              
              {/* Scan buttons */}
              <Button
                onClick={handleScanUsers}
                disabled={isScanningUsers || isScanning || !modelsLoaded}
                variant="outline"
              >
                {isScanningUsers ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang quét... {scanProgress}%
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 mr-2" />
                    Quét người dùng
                  </>
                )}
              </Button>
              <Button
                onClick={handleScanAllPhotos}
                disabled={isScanning || isScanningUsers || weekPhotos.length < 1 || !modelsLoaded}
                className="btn-primary-gradient"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang quét... {scanProgress}%
                  </>
                ) : (
                  <>
                    <ScanFace className="w-4 h-4 mr-2" />
                    Quét tất cả ảnh
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Model loading status */}
          {!modelsLoaded && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                Đang tải mô hình nhận diện khuôn mặt...
              </span>
            </div>
          )}

          {/* User Mismatches Report */}
          {showUserMismatches && userMismatches.length > 0 && (
            <div className="mb-4 p-4 bg-muted/50 border border-border rounded-xl shrink-0">
              <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Báo cáo sinh viên không khớp ảnh
              </h3>
              <div className="space-y-2 max-h-[150px] overflow-auto">
                {userMismatches.map((mismatch, index) => (
                  <button
                    key={index}
                    className="w-full p-3 bg-card rounded-lg hover:bg-muted/50 transition-colors cursor-pointer text-left"
                    onClick={() => setSelectedMismatchUser(mismatch)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{mismatch.studentName}</p>
                        <p className="text-sm text-muted-foreground">{mismatch.studentCode}</p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <span className="px-2 py-1 bg-destructive/10 text-destructive rounded-lg text-sm font-medium">
                          Tuần {mismatch.mismatchedWeeks.join(", ")} không khớp
                        </span>
                        <span className="text-primary text-sm">Xem ảnh →</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No Face Photos Report */}
          {showNoFace && noFacePhotos.length > 0 && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl shrink-0">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-3 flex items-center gap-2">
                <ImageOff className="w-5 h-5" />
                Ảnh không phát hiện khuôn mặt
              </h3>
              <div className="space-y-2 max-h-[150px] overflow-auto">
                {noFacePhotos.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-white dark:bg-card rounded-lg flex items-center gap-4"
                  >
                    <button
                      onClick={() => setSelectedPhoto(item.record.photo_url)}
                      className="flex items-center gap-2 hover:bg-muted/50 p-2 rounded-lg transition-colors"
                    >
                      <img
                        src={item.record.photo_url}
                        alt={item.record.name}
                        className="w-12 h-12 object-cover rounded-lg"
                      />
                      <div className="text-left">
                        <p className="text-sm font-medium">{item.record.name}</p>
                        <p className="text-xs text-muted-foreground">{item.record.student_code}</p>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duplicates Report */}
          {showDuplicates && duplicates.length > 0 && (
            <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl shrink-0">
              <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Báo cáo khuôn mặt trùng lặp
              </h3>
              <div className="space-y-3 max-h-[150px] overflow-auto">
                {duplicates.map((dup, index) => (
                  <div
                    key={index}
                    className="p-3 bg-white dark:bg-card rounded-lg flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <button
                        onClick={() => setSelectedPhoto(dup.photo1.photo_url)}
                        className="flex items-center gap-2 hover:bg-muted/50 p-2 rounded-lg transition-colors"
                      >
                        <img
                          src={dup.photo1.photo_url}
                          alt={dup.photo1.name}
                          className="w-12 h-12 object-cover rounded-lg"
                        />
                        <div className="text-left">
                          <p className="text-sm font-medium">{dup.photo1.name}</p>
                          <p className="text-xs text-muted-foreground">{dup.photo1.student_code}</p>
                        </div>
                      </button>
                      <span className="text-xl text-orange-500">↔</span>
                      <button
                        onClick={() => setSelectedPhoto(dup.photo2.photo_url)}
                        className="flex items-center gap-2 hover:bg-muted/50 p-2 rounded-lg transition-colors"
                      >
                        <img
                          src={dup.photo2.photo_url}
                          alt={dup.photo2.name}
                          className="w-12 h-12 object-cover rounded-lg"
                        />
                        <div className="text-left">
                          <p className="text-sm font-medium">{dup.photo2.name}</p>
                          <p className="text-xs text-muted-foreground">{dup.photo2.student_code}</p>
                        </div>
                      </button>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-lg text-sm font-medium">
                        {Math.round(dup.similarity * 100)}% giống
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photos Grid */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : weekPhotos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Chưa có ảnh nào trong tuần {selectedWeek}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {weekPhotos.map((record) => (
                  <div
                    key={record.id}
                    className="group relative rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300"
                    onClick={() => setSelectedPhoto(record.photo_url)}
                  >
                    <img
                      src={record.photo_url}
                      alt={record.name}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                        <p className="font-medium text-sm line-clamp-1">{record.name}</p>
                        <p className="text-xs opacity-80">{record.student_code}</p>
                        <p className="text-xs opacity-80">Nhóm {record.group_number}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Hidden canvas for face detection */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Photo View Modal */}
      {selectedPhoto && (
        <PhotoViewModal
          photoUrl={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      )}

      {/* Mismatch Comparison Modal */}
      {selectedMismatchUser && (
        <div 
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedMismatchUser(null)}
        >
          <div 
            className="bg-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold">{selectedMismatchUser.studentName}</h3>
                <p className="text-sm text-muted-foreground">{selectedMismatchUser.studentCode}</p>
              </div>
              <button
                onClick={() => setSelectedMismatchUser(null)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Matched Photos */}
                <div>
                  <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Ảnh khớp (Tuần {selectedMismatchUser.matchedWeeks.join(", ")})
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedMismatchUser.photos
                      .filter(p => p.matched)
                      .map((photo, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedPhoto(photo.url)}
                          className="relative rounded-lg overflow-hidden group cursor-pointer border-2 border-primary/30"
                        >
                          <img
                            src={photo.url}
                            alt={`Tuần ${photo.week}`}
                            className="w-full aspect-square object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-primary/80 text-primary-foreground text-center text-sm font-medium">
                            Tuần {photo.week}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Mismatched Photos */}
                <div>
                  <h4 className="font-semibold text-destructive mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Ảnh không khớp (Tuần {selectedMismatchUser.mismatchedWeeks.join(", ")})
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedMismatchUser.photos
                      .filter(p => !p.matched)
                      .map((photo, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedPhoto(photo.url)}
                          className="relative rounded-lg overflow-hidden group cursor-pointer border-2 border-destructive/30"
                        >
                          <img
                            src={photo.url}
                            alt={`Tuần ${photo.week}`}
                            className="w-full aspect-square object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-destructive text-destructive-foreground text-center text-sm font-medium">
                            Tuần {photo.week}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoStorageModal;
