import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { z } from "zod";

const pinSchema = z.string().length(6, "Mật khẩu phải có 6 chữ số").regex(/^\d+$/, "Chỉ được nhập số");

interface SetProtectionPasswordModalProps {
  onClose: () => void;
}

const SetProtectionPasswordModal = ({ onClose }: SetProtectionPasswordModalProps) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [showPin, setShowPin] = useState(false);
  const [step, setStep] = useState<"check" | "set">("check");

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const { data, error } = await (supabase.rpc as any)("is_protection_password_enabled");
      if (error) throw error;
      setIsEnabled(data || false);
    } catch (error) {
      console.error("Check status error:", error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handlePinChange = (
    index: number,
    value: string,
    pinState: string[],
    setPinState: React.Dispatch<React.SetStateAction<string[]>>,
    prefix: string
  ) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newPin = [...pinState];
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newPin[index + i] = digit;
        }
      });
      setPinState(newPin);
      const nextIndex = Math.min(index + digits.length, 5);
      const nextInput = document.getElementById(`${prefix}-${nextIndex}`);
      nextInput?.focus();
      return;
    }

    if (!/^\d*$/.test(value)) return;

    const newPin = [...pinState];
    newPin[index] = value;
    setPinState(newPin);

    if (value && index < 5) {
      const nextInput = document.getElementById(`${prefix}-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent,
    pinState: string[],
    prefix: string
  ) => {
    if (e.key === "Backspace" && !pinState[index] && index > 0) {
      const prevInput = document.getElementById(`${prefix}-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleSave = async () => {
    const pinString = pin.join("");
    const confirmPinString = confirmPin.join("");

    // Validate PIN length and format
    if (pinString.length !== 6) {
      toast.error("Mật khẩu phải có đủ 6 chữ số!");
      return;
    }

    const result = pinSchema.safeParse(pinString);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    if (pinString !== confirmPinString) {
      toast.error("Mật khẩu xác nhận không khớp!");
      return;
    }

    setIsLoading(true);
    try {
      // Get current session to ensure user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!");
        return;
      }

      const { data, error } = await (supabase.rpc as any)("set_protection_password", {
        p_password: pinString,
      });

      if (error) {
        console.error("RPC error:", error);
        throw error;
      }

      console.log("Set protection password result:", data);
      toast.success("Đã thiết lập mật khẩu bảo vệ!");
      setIsEnabled(true);
      setStep("check");
      setPin(["", "", "", "", "", ""]);
      setConfirmPin(["", "", "", "", "", ""]);
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error?.message || "Có lỗi xảy ra khi lưu mật khẩu!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    setIsLoading(true);
    try {
      const { error } = await (supabase.rpc as any)("disable_protection_password");
      if (error) throw error;

      toast.success("Đã tắt mật khẩu bảo vệ!");
      setIsEnabled(false);
    } catch (error) {
      console.error("Disable error:", error);
      toast.error("Có lỗi xảy ra!");
    } finally {
      setIsLoading(false);
    }
  };

  const renderPinInputs = (
    pinState: string[],
    setPinState: React.Dispatch<React.SetStateAction<string[]>>,
    prefix: string
  ) => (
    <div className="flex justify-center gap-2">
      {pinState.map((digit, index) => (
        <input
          key={index}
          id={`${prefix}-${index}`}
          type={showPin ? "text" : "password"}
          inputMode="numeric"
          maxLength={6}
          value={digit}
          onChange={(e) => handlePinChange(index, e.target.value, pinState, setPinState, prefix)}
          onKeyDown={(e) => handleKeyDown(index, e, pinState, prefix)}
          className="w-10 h-12 text-center text-xl font-bold border-2 rounded-xl bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        />
      ))}
    </div>
  );

  const isPinComplete = pin.every((d) => d !== "") && confirmPin.every((d) => d !== "");

  if (isCheckingStatus) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Mật khẩu bảo vệ</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "check" ? (
          <>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl mb-4">
              <div>
                <p className="font-medium">Bật mật khẩu bảo vệ</p>
                <p className="text-xs text-muted-foreground">
                  Yêu cầu nhập PIN 6 số mỗi khi vào trang admin
                </p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setStep("set");
                  } else {
                    handleDisable();
                  }
                }}
                disabled={isLoading}
              />
            </div>

            {isEnabled && (
              <Button
                variant="outline"
                onClick={() => setStep("set")}
                className="w-full"
              >
                Đổi mật khẩu bảo vệ
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Nhập mật khẩu 6 chữ số
            </p>

            {renderPinInputs(pin, setPin, "new-pin")}

            <p className="text-sm text-muted-foreground text-center pt-2">
              Xác nhận mật khẩu
            </p>

            {renderPinInputs(confirmPin, setConfirmPin, "confirm-pin")}

            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mx-auto"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPin ? "Ẩn" : "Hiện"} mật khẩu
            </button>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("check");
                  setPin(["", "", "", "", "", ""]);
                  setConfirmPin(["", "", "", "", "", ""]);
                }}
                className="flex-1"
              >
                Hủy
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isPinComplete || isLoading}
                className="flex-1 btn-primary-gradient"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Lưu"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetProtectionPasswordModal;
