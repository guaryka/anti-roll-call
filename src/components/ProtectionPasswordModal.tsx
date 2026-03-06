import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { z } from "zod";

const pinSchema = z.string().length(6, "Mật khẩu phải có 6 chữ số").regex(/^\d+$/, "Chỉ được nhập số");

interface ProtectionPasswordModalProps {
  onClose: () => void;
  onVerified: () => void;
}

const ProtectionPasswordModal = ({ onClose, onVerified }: ProtectionPasswordModalProps) => {
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, "").slice(0, 6).split("");
      const newPin = [...pin];
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newPin[index + i] = digit;
        }
      });
      setPin(newPin);
      // Focus last filled or next empty
      const nextIndex = Math.min(index + digits.length, 5);
      const nextInput = document.getElementById(`pin-${nextIndex}`);
      nextInput?.focus();
      return;
    }

    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      const prevInput = document.getElementById(`pin-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerify = async () => {
    const pinString = pin.join("");
    
    const result = pinSchema.safeParse(pinString);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("verify_protection_password", {
        p_password: pinString,
      });

      if (error) throw error;

      if (data) {
        toast.success("Xác thực thành công!");
        onVerified();
      } else {
        toast.error("Mật khẩu không đúng!");
        setPin(["", "", "", "", "", ""]);
        document.getElementById("pin-0")?.focus();
      }
    } catch (error) {
      console.error("Verify error:", error);
      toast.error("Có lỗi xảy ra!");
    } finally {
      setIsLoading(false);
    }
  };

  const isPinComplete = pin.every((d) => d !== "");

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in">
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

        <p className="text-sm text-muted-foreground mb-6 text-center">
          Nhập mật khẩu 6 chữ số để truy cập trang quản trị
        </p>

        {/* PIN Input */}
        <div className="flex justify-center gap-2 mb-6">
          {pin.map((digit, index) => (
            <input
              key={index}
              id={`pin-${index}`}
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              maxLength={6}
              value={digit}
              onChange={(e) => handlePinChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-11 h-14 text-center text-2xl font-bold border-2 rounded-xl bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              autoFocus={index === 0}
            />
          ))}
        </div>

        {/* Show/Hide Toggle */}
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mx-auto mb-6"
        >
          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPin ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        </button>

        <Button
          onClick={handleVerify}
          disabled={!isPinComplete || isLoading}
          className="w-full btn-primary-gradient"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Đang xác thực...
            </>
          ) : (
            "Xác nhận"
          )}
        </Button>
      </div>
    </div>
  );
};

export default ProtectionPasswordModal;
