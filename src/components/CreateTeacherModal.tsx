import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, UserPlus, Mail, Lock, Loader2 } from "lucide-react";

interface CreateTeacherModalProps {
  onClose: () => void;
}

const CreateTeacherModal = ({ onClose }: CreateTeacherModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Vui lòng nhập email!");
      return;
    }

    if (!password) {
      toast.error("Vui lòng nhập mật khẩu!");
      return;
    }

    if (password.length < 6) {
      toast.error("Mật khẩu phải có ít nhất 6 ký tự!");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp!");
      return;
    }

    setIsLoading(true);
    try {
      // Get current admin session first
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Phiên đăng nhập đã hết hạn!");
        return;
      }
      
      const adminUserId = session.user.id;
      
      // First, add to teachers table (before creating auth account)
      // This ensures the RLS policy check passes
      const { error: teacherError } = await supabase
        .from("teachers")
        .insert({
          email: email.trim().toLowerCase(),
          created_by: adminUserId,
        });

      if (teacherError) {
        console.error("Error adding teacher to table:", teacherError);
        if (teacherError.code === '23505') {
          toast.error("Email này đã có trong danh sách giảng viên!");
        } else {
          toast.error("Không thể thêm giảng viên vào danh sách!");
        }
        return;
      }

      // Create the teacher account using Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        // Rollback: delete from teachers table
        await supabase.from("teachers").delete().eq("email", email.trim().toLowerCase());
        
        if (signUpError.message.includes("already registered")) {
          toast.error("Email này đã được đăng ký!");
        } else {
          throw signUpError;
        }
        return;
      }

      if (!signUpData.user) {
        // Rollback: delete from teachers table
        await supabase.from("teachers").delete().eq("email", email.trim().toLowerCase());
        throw new Error("Không thể tạo tài khoản!");
      }

      toast.success(`Đã tạo tài khoản giảng viên: ${email}`);
      onClose();
    } catch (error) {
      console.error("Error creating teacher:", error);
      const message = error instanceof Error ? error.message : "Không thể tạo tài khoản!";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="modal-content w-full max-w-md p-6 md:p-8 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Tạo tài khoản giảng viên</h2>
              <p className="text-sm text-muted-foreground">Giảng viên có quyền quản lý lớp học</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email giảng viên
            </Label>
            <Input
              type="email"
              placeholder="teacher@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-modern"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Mật khẩu
            </Label>
            <Input
              type="password"
              placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-modern"
            />
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Xác nhận mật khẩu
            </Label>
            <Input
              type="password"
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-modern"
            />
          </div>

          {/* Info */}
          <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            <p>Giảng viên có thể:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Tạo và quản lý lớp học</li>
              <li>Xem và quản lý điểm danh</li>
              <li>Xuất báo cáo Excel</li>
            </ul>
            <p className="mt-2 text-xs opacity-75">
              Lưu ý: Giảng viên không thể tạo tài khoản giảng viên khác.
            </p>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary-gradient"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang tạo...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Tạo tài khoản
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CreateTeacherModal;
