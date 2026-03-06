import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Lock, Mail, Loader2 } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

const ADMIN_EMAIL = "admindiemdanh@gmail.com";
const ADMIN_PASSWORD = "Admin123@";

interface LoginModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const LoginModal = ({ onClose, onSuccess }: LoginModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate input
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === "email") fieldErrors.email = err.message;
        if (err.path[0] === "password") fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Check if it's the admin account
    if (email !== ADMIN_EMAIL) {
      toast.error("Tài khoản không tồn tại!");
      return;
    }

    // Check if password matches
    if (password !== ADMIN_PASSWORD) {
      toast.error("Mật khẩu không chính xác!");
      return;
    }

    setIsLoading(true);

    try {
      // Try to sign in first
      let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // If user doesn't exist, create the admin account automatically
      if (error && error.message.includes("Invalid login credentials")) {
        console.log("Admin account not found, creating...");
        
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          options: {
            emailRedirectTo: `${window.location.origin}/admin`,
          },
        });

        if (signUpError) {
          console.error("Signup error:", signUpError);
          toast.error("Không thể tạo tài khoản admin: " + signUpError.message);
          return;
        }

        // Try to sign in again after creating
        const signInResult = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        });

        if (signInResult.error) {
          toast.info("Tài khoản admin đã được tạo! Vui lòng đăng nhập lại.");
          return;
        }

        data = signInResult.data;
        error = signInResult.error;
      }

      if (error) {
        toast.error("Đăng nhập thất bại: " + error.message);
        return;
      }

      toast.success("Đăng nhập thành công!");
      onSuccess();
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Có lỗi xảy ra khi đăng nhập!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="modal-content w-full max-w-md p-8 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Đăng nhập Admin</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 input-modern"
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Mật khẩu
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 input-modern"
                />
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary-gradient py-6 text-base"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng nhập"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Chỉ dành cho quản trị viên
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
