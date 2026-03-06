import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Loader2, RefreshCw, CheckCircle, AlertTriangle, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, X, Shuffle } from "lucide-react";
import * as faceapi from "@vladmandic/face-api";

// Only head turn actions - no eye actions
type ActionType = "turn_left" | "turn_right" | "look_up" | "look_down";

interface LivenessVerificationProps {
  onVerified: () => void;
  onCancel: () => void;
  referencePhotoUrl?: string; // Photo taken during attendance for face comparison
}

const ACTION_CONFIG: Record<ActionType, { label: string; icon: React.ReactNode; description: string }> = {
  turn_left: {
    label: "Quay trái",
    icon: <ArrowLeft className="w-8 h-8" />,
    description: "Quay mặt sang bên trái",
  },
  turn_right: {
    label: "Quay phải",
    icon: <ArrowRight className="w-8 h-8" />,
    description: "Quay mặt sang bên phải",
  },
  look_up: {
    label: "Ngẩng mặt lên",
    icon: <ArrowUp className="w-8 h-8" />,
    description: "Ngẩng mặt lên trên",
  },
  look_down: {
    label: "Cúi mặt xuống",
    icon: <ArrowDown className="w-8 h-8" />,
    description: "Cúi mặt xuống dưới",
  },
};

// Only 4 head turn actions
const ALL_ACTIONS: ActionType[] = ["turn_left", "turn_right", "look_up", "look_down"];

const LivenessVerification = ({ onVerified, onCancel, referencePhotoUrl }: LivenessVerificationProps) => {
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "detecting" | "success" | "failed" | "face_mismatch">("idle");
  const [countdown, setCountdown] = useState(5);
  const [faceDetected, setFaceDetected] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const initialLandmarksRef = useRef<faceapi.FaceLandmarks68 | null>(null);
  const successCountRef = useRef(0);
  const referenceDescriptorRef = useRef<Float32Array | null>(null);
  const modelsLoadedRef = useRef(false);
  const faceComparisonDoneRef = useRef(false);

  // Load face-api models
  useEffect(() => {
    loadModels();
    return () => {
      stopCamera();
      cleanupIntervals();
    };
  }, []);

  const cleanupIntervals = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };
useEffect(() => {
    // Khi active bật lên và đã có stream -> gán vào video ngay
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraActive]);
  const loadModels = async () => {
    if (modelsLoadedRef.current) {
      setIsModelLoading(false);
      return;
    }

    try {
      const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
      
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      
      modelsLoadedRef.current = true;
      
      // Extract face descriptor from reference photo if provided
      if (referencePhotoUrl) {
        await extractReferenceDescriptor(referencePhotoUrl);
      }
      
      setIsModelLoading(false);
    } catch (error) {
      console.error("Error loading face-api models:", error);
      toast.error("Không thể tải mô hình nhận diện khuôn mặt");
      setIsModelLoading(false);
    }
  };

  const extractReferenceDescriptor = async (photoUrl: string) => {
    try {
      const img = await faceapi.fetchImage(photoUrl);
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (detection) {
        referenceDescriptorRef.current = detection.descriptor;
        console.log("Reference face descriptor extracted successfully");
      } else {
        console.warn("No face found in reference photo");
        toast.error("Không tìm thấy khuôn mặt trong ảnh điểm danh. Vui lòng chụp lại.");
      }
    } catch (error) {
      console.error("Error extracting reference descriptor:", error);
    }
  };

  // CRITICAL: Camera must be started directly from user click gesture
  // This is a browser security requirement to prevent unauthorized media capture
 // --- SỬA LẠI TOÀN BỘ HÀM NÀY (Dòng 136 - 218) ---
  const startCamera = useCallback(async () => {
    console.log("Starting camera - direct user gesture");
    setIsCameraLoading(true);
    setStatusMessage("Đang khởi động camera...");
    faceComparisonDoneRef.current = false;
    
    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      // SỬA: Bỏ "exact: user" để tránh lỗi trên máy tính/một số điện thoại
      // Chỉ dùng "user" là đủ để ưu tiên cam trước
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user", 
          width: { ideal: 640, min: 320 }, 
          height: { ideal: 480, min: 240 } 
        },
        audio: false,
      });
      
      console.log("Camera stream obtained:", stream.getVideoTracks()[0]?.label);
      streamRef.current = stream;
      
      // QUAN TRỌNG: Bật active lên trước để React vẽ thẻ <video>
      // useEffect ở Bước 1 sẽ tự động gán stream vào video
      setIsCameraActive(true);
      setIsCameraLoading(false);
      setStatusMessage("");
      selectRandomAction();
    
      
    } catch (error: any) {
      console.error("Camera error:", error);
      setIsCameraLoading(false);
      
      // Xử lý lỗi (giữ nguyên logic thông báo lỗi của bạn)
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        toast.error("Bạn đã từ chối quyền camera. Vui lòng cho phép trong cài đặt trình duyệt.");
        setStatusMessage("Vui lòng cho phép quyền camera");
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        toast.error("Không tìm thấy camera. Vui lòng kiểm tra thiết bị.");
        setStatusMessage("Không tìm thấy camera");
      } else {
        // Fallback thử lại nếu lỗi cấu hình (OverconstrainedError)
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            streamRef.current = fallbackStream;
            setIsCameraActive(true);
            setIsCameraLoading(false);
            setStatusMessage("");
            selectRandomAction();
            setTimeout(() => startFaceDetection(), 500);
        } catch (e) {
            toast.error("Không thể truy cập camera. Vui lòng thử lại.");
            setStatusMessage("Lỗi camera");
        }
      }
    }
  }, []);
const stableCountRef = useRef(0);
const lastDetectTimeRef = useRef(0);
const faceDetectedRef = useRef(false);

const startFaceDetection = () => {
  const loop = async (time: number) => {
    const video = videoRef.current;
    if (!video || !isCameraActive) {
      requestAnimationFrame(loop);
      return;
    }


    if (video.readyState < 2 || video.videoWidth === 0) {
      requestAnimationFrame(loop);
      return;
    }

    if (time - lastDetectTimeRef.current > 200) {
      lastDetectTimeRef.current = time;


      try {
        const detection = await faceapi.detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 160, // 🔥 SỬA: 224 → 160
            scoreThreshold: 0.25, // 🔥 SỬA: 0.2 → 0.25
          })
        );

        if (detection) stableCountRef.current++;
        else stableCountRef.current = 0;


        const detected = stableCountRef.current >= 2;

        // 🔥 CHỈ setState KHI CÓ THAY ĐỔI
        if (faceDetectedRef.current !== detected) {
          faceDetectedRef.current = detected;
          setFaceDetected(detected);
        }
      } catch {
        stableCountRef.current = 0;
        if (faceDetectedRef.current !== false) {
          faceDetectedRef.current = false;
          setFaceDetected(false);
        }
      }

    }

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
};




  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    cleanupIntervals();
  }, []);

  const selectRandomAction = () => {
    const randomIndex = Math.floor(Math.random() * ALL_ACTIONS.length);
    setCurrentAction(ALL_ACTIONS[randomIndex]);
    setVerificationStatus("idle");
    setCountdown(5);
    successCountRef.current = 0;
    initialLandmarksRef.current = null;
    setDetectionProgress(0);
  };

  // Switch to a different random action (button function)
  const switchAction = () => {
    const currentIndex = currentAction ? ALL_ACTIONS.indexOf(currentAction) : -1;
    // Get a different action
    let newIndex = Math.floor(Math.random() * ALL_ACTIONS.length);
    while (newIndex === currentIndex && ALL_ACTIONS.length > 1) {
      newIndex = Math.floor(Math.random() * ALL_ACTIONS.length);
    }
    setCurrentAction(ALL_ACTIONS[newIndex]);
    setCountdown(5);
    successCountRef.current = 0;
    initialLandmarksRef.current = null;
    setDetectionProgress(0);
  };

  const startVerification = async () => {
    setIsVerifying(true);
    setVerificationStatus("detecting");
    setDetectionProgress(0);
    successCountRef.current = 0;
    initialLandmarksRef.current = null;
    
    // Stop continuous detection
    if (detectionIntervalRef.current) {
      detectionIntervalRef.current = null;
    }
    
    // Start action detection loop with faster interval for smoother experience
    detectionIntervalRef.current = window.setInterval(async () => {
      await detectFaceAction();
    }, 100) as unknown as number; // Faster detection for smoother feedback

    // Countdown timer
    let timeLeft = 5;
    countdownIntervalRef.current = window.setInterval(() => {
      timeLeft--;
      setCountdown(timeLeft);
      
      if (timeLeft <= 0) {
        cleanupIntervals();
        finishVerification();
      }
    }, 1000);
  };

  const finishVerification = async () => {
    // Check if action was performed successfully
    if (successCountRef.current >= 3) {
      // If we have a reference photo, compare faces
      if (referenceDescriptorRef.current && videoRef.current) {
        setStatusMessage("Đang so sánh khuôn mặt...");
        
        try {
          const currentDetection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.25 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          
          if (currentDetection) {
            const distances: number[] = [];
          
            for (let i = 0; i < 2; i++) {
              const d = await faceapi
              .detectSingleFace(
                videoRef.current,
                new faceapi.TinyFaceDetectorOptions({
                  inputSize: 320,
                  scoreThreshold: 0.35, // siết hơn
                })
              )
              .withFaceLandmarks()
              .withFaceDescriptor();
          
              if (d) {
                const dist = faceapi.euclideanDistance(
                  referenceDescriptorRef.current,
                  d.descriptor
                );
                distances.push(dist);
              }
          
              await new Promise(r => setTimeout(r, 120));
            }
          
            if (distances.length < 2) {
              setVerificationStatus("failed");
              setStatusMessage("Không giữ được khuôn mặt ổn định khi xác minh");
              setIsVerifying(false);
              return;
            }
          
            const avgDistance =
              distances.reduce((a, b) => a + b, 0) / distances.length;
          
            console.log("Face match avg distance:", avgDistance);
            const maxDistance = Math.max(...distances);
            if (avgDistance < 0.48 && maxDistance < 0.55) {
              setVerificationStatus("success");
              faceComparisonDoneRef.current = true;
              setTimeout(() => onVerified(), 1000);
            } else {
              setVerificationStatus("face_mismatch");
              setStatusMessage(
                `Khuôn mặt không trùng khớp (${Math.round(avgDistance * 100)}%)`
              );
              setIsVerifying(false);
            }
          } else {
            setVerificationStatus("failed");
            setStatusMessage("Không phát hiện khuôn mặt khi so sánh");
            setIsVerifying(false);
          }
        } catch (error) {
          console.error("Face comparison error:", error);
          setVerificationStatus("failed");
          setStatusMessage("Lỗi khi so sánh khuôn mặt");
          setIsVerifying(false);
        }
      } else {
        // No reference photo, just verify liveness
        setVerificationStatus("success");
        setTimeout(() => {
          onVerified();
        }, 1000);
      }
    } else {
      setVerificationStatus("failed");
      setStatusMessage("Không nhận diện được hành động. Hãy thực hiện rõ ràng hơn.");
      setIsVerifying(false);
    }
  };

  const detectFaceAction = async () => {
    if (!videoRef.current || !currentAction) return;

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 320,
          scoreThreshold: 0.25 
        }))
        .withFaceLandmarks();

      if (!detection) {
        setFaceDetected(false);
        return;
      }

      setFaceDetected(true);
      const landmarks = detection.landmarks;

      // Store initial landmarks for comparison
      if (!initialLandmarksRef.current) {
        initialLandmarksRef.current = landmarks;
        return;
      }

      const isActionDetected = checkActionPerformed(landmarks, currentAction);
      
      if (isActionDetected) {
        successCountRef.current++;
        setDetectionProgress(Math.min(100, (successCountRef.current / 3) * 100));
      
        initialLandmarksRef.current = landmarks; 
      }
    } catch (error) {
      console.error("Detection error:", error);
    }
  };

  const checkActionPerformed = (landmarks: faceapi.FaceLandmarks68, action: ActionType): boolean => {
    const initial = initialLandmarksRef.current;
    if (!initial) return false;

    const nose = landmarks.getNose();
    const initialNose = initial.getNose();

    // Get nose tip position
    const noseTip = nose[3];
    const initialNoseTip = initialNose[3];

    // Calculate horizontal and vertical movement
    const horizontalMovement = noseTip.x - initialNoseTip.x;
    const verticalMovement = noseTip.y - initialNoseTip.y;

    // Lower thresholds for easier detection
    const MOVEMENT_THRESHOLD = 12;

    switch (action) {
      case "turn_left":
        return horizontalMovement < -MOVEMENT_THRESHOLD;
      case "turn_right":
        return horizontalMovement > MOVEMENT_THRESHOLD;
      case "look_up":
        return verticalMovement < -MOVEMENT_THRESHOLD * 0.5;
      case "look_down":
        return verticalMovement > MOVEMENT_THRESHOLD * 0.5;
      default:
        return false;
    }
  };

  const retryVerification = () => {
    cleanupIntervals();
    selectRandomAction();
    setIsVerifying(false);
    setStatusMessage("");
    faceComparisonDoneRef.current = false;
   
  };

  if (isModelLoading) {
    return (
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        style={{ zIndex: 9999 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-card rounded-2xl p-8 text-center max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground font-medium">Đang tải mô hình nhận diện...</p>
          <p className="text-sm text-muted-foreground mt-2">Vui lòng chờ trong giây lát</p>
          <Button variant="outline" onClick={onCancel} className="mt-4">
            Hủy
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          style={{ zIndex: 10 }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Camera className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Xác minh danh tính</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Thực hiện hành động để xác minh bạn là người thật
          </p>
        </div>

        {/* Camera View */}
        <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden mb-4">
          {isCameraActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlaying={() => {
                  console.log("🎥 Video started");
                  startFaceDetection();
                }}
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
              
              {/* Face detection indicator */}
              <div className={`absolute top-3 left-3 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                faceDetected ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"
              }`}>
                <div className={`w-2 h-2 rounded-full ${faceDetected ? "bg-white" : "bg-white animate-pulse"}`} />
                {faceDetected ? "Phát hiện khuôn mặt" : "Đưa mặt vào camera"}
              </div>

              {/* Action instruction overlay */}
              {currentAction && !isVerifying && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <div className="text-center text-white">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      {ACTION_CONFIG[currentAction].icon}
                      <span className="text-lg font-bold">{ACTION_CONFIG[currentAction].label}</span>
                    </div>
                    <p className="text-sm opacity-80">{ACTION_CONFIG[currentAction].description}</p>
                  </div>
                </div>
              )}

              {/* Verifying overlay */}
              {isVerifying && verificationStatus === "detecting" && currentAction && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <div className="text-center text-white">
                    <div className="flex items-center justify-center gap-3 mb-2">
                      {ACTION_CONFIG[currentAction].icon}
                      <span className="text-lg font-bold">{ACTION_CONFIG[currentAction].label}</span>
                    </div>
                    <p className="text-sm opacity-80">Đang xác minh... Hãy thực hiện rõ ràng!</p>
                  </div>
                </div>
              )}

              {/* Countdown overlay */}
              {isVerifying && verificationStatus === "detecting" && (
                <div className="absolute top-3 right-3 w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{countdown}</span>
                </div>
              )}

              {/* Progress bar */}
              {isVerifying && verificationStatus === "detecting" && (
                <div className="absolute top-16 right-3 left-3">
                  <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all duration-200"
                      style={{ width: `${detectionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Camera loading overlay */}
              {isCameraLoading && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Loader2 className="w-10 h-10 animate-spin mx-auto mb-2" />
                    <p className="text-sm">{statusMessage || "Đang khởi động..."}</p>
                  </div>
                </div>
              )}

              {/* Success overlay */}
              {verificationStatus === "success" && (
                <div className="absolute inset-0 bg-green-500/80 flex items-center justify-center">
                  <div className="text-center text-white">
                    <CheckCircle className="w-16 h-16 mx-auto mb-3" />
                    <p className="text-xl font-bold">Xác minh thành công!</p>
                  </div>
                </div>
              )}

              {/* Failed overlay */}
              {verificationStatus === "failed" && (
                <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center">
                  <div className="text-center text-white">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-3" />
                    <p className="text-xl font-bold">Xác minh thất bại</p>
                    <p className="text-sm mt-1">{statusMessage || "Vui lòng thử lại"}</p>
                  </div>
                </div>
              )}

              {/* Face mismatch overlay */}
              {verificationStatus === "face_mismatch" && (
                <div className="absolute inset-0 bg-orange-500/80 flex items-center justify-center">
                  <div className="text-center text-white px-4">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-3" />
                    <p className="text-xl font-bold">Không trùng khớp!</p>
                    <p className="text-sm mt-1">{statusMessage || "Khuôn mặt không giống với ảnh điểm danh"}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
              <Camera className="w-16 h-16 mb-3" />
              <p>Bấm nút bên dưới để bắt đầu</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {!isCameraActive ? (
            <>
              <Button onClick={startCamera} className="w-full btn-primary-gradient py-6" disabled={isCameraLoading}>
                {isCameraLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Camera className="w-5 h-5 mr-2" />}
                Mở camera xác minh
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">
                Hủy
              </Button>
            </>
          ) : verificationStatus === "failed" || verificationStatus === "face_mismatch" ? (
            <>
              <Button onClick={retryVerification} className="w-full btn-primary-gradient py-6">
                <RefreshCw className="w-5 h-5 mr-2" />
                Thử lại
              </Button>
              <Button variant="outline" onClick={onCancel} className="w-full">
                Hủy
              </Button>
            </>
          ) : verificationStatus === "idle" && !isVerifying ? (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={switchAction}
                  variant="outline"
                  className="shrink-0"
                  disabled={isCameraLoading}
                  title="Đổi hành động khác"
                >
                  <Shuffle className="w-4 h-4" />
                </Button>
                <Button 
                  onClick={startVerification} 
                  className="flex-1 btn-primary-gradient py-6"
                  disabled={!faceDetected || isCameraLoading}
                >
                  {isCameraLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Đang tải...
                    </>
                  ) : faceDetected ? (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Bắt đầu xác minh
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Đưa mặt vào camera...
                    </>
                  )}
                </Button>
              </div>
              <Button variant="outline" onClick={onCancel} className="w-full">
                Hủy
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default LivenessVerification;
