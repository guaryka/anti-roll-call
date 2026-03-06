import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, ShieldCheck, UserPlus, Key, LogOut, Menu } from "lucide-react";

interface AdminSettingsMenuProps {
  isAdmin: boolean;
  onProtectionPassword: () => void;
  onCreateTeacher: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  isMobile?: boolean;
}

const AdminSettingsMenu = ({
  isAdmin,
  onProtectionPassword,
  onCreateTeacher,
  onChangePassword,
  onLogout,
  isMobile = false,
}: AdminSettingsMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={isMobile ? "icon" : "default"} className="shrink-0">
          {isMobile ? (
            <Menu className="w-5 h-5" />
          ) : (
            <>
              <Settings className="w-4 h-4 mr-2" />
              Cài đặt
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onProtectionPassword} className="cursor-pointer">
          <ShieldCheck className="w-4 h-4 mr-2" />
          Mật khẩu bảo vệ
        </DropdownMenuItem>
        
        {isAdmin && (
          <DropdownMenuItem onClick={onCreateTeacher} className="cursor-pointer">
            <UserPlus className="w-4 h-4 mr-2" />
            Tạo tài khoản GV
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem onClick={onChangePassword} className="cursor-pointer">
          <Key className="w-4 h-4 mr-2" />
          Đổi mật khẩu
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive">
          <LogOut className="w-4 h-4 mr-2" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AdminSettingsMenu;
