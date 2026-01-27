import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Search, RefreshCw, BookOpen } from "lucide-react";

interface ClassItem {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

const Codes = () => {
  const [keyword, setKeyword] = useState("");
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadInitial = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, code, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error("Error loading classes:", error);
      toast.error("Không thể tải danh sách mã lớp");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  const handleSearch = async () => {
    if (!keyword.trim()) {
      await loadInitial();
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, code, created_at")
        .ilike("code", `%${keyword.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error("Error searching classes:", error);
      toast.error("Không thể tìm kiếm mã lớp");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="w-full px-6 py-4 border-b bg-card flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Danh sách mã lớp</h1>
          <p className="text-sm text-muted-foreground">
            Xem và tìm kiếm mã điểm danh của các lớp
          </p>
        </div>
      </header>

      <main className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            placeholder="Nhập vài số mã lớp (ví dụ: 123)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="input-modern md:flex-1"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleSearch}
              disabled={isLoading}
              className="md:px-6"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Tìm
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setKeyword("");
                await loadInitial();
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Làm mới
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Tổng: {classes.length} lớp
          </p>
          {classes.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground">
              Không có lớp nào.
            </Card>
          ) : (
            <div className="space-y-2">
              {classes.map((cls) => (
                <Card
                  key={cls.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-foreground">
                      {cls.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Tạo lúc:{" "}
                      {new Date(cls.created_at).toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono text-lg font-bold text-primary">
                      {cls.code}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Codes;

