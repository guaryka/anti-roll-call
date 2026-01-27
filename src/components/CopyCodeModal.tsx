import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X, Copy, Check } from "lucide-react";
interface CopyCodeModalProps {
  code: string;
  className: string;
  onClose: () => void;
}
const CopyCodeModal = ({
  code,
  className,
  onClose
}: CopyCodeModalProps) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Đã sao chép mã lớp!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Không thể sao chép!");
    }
  };
  return <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="modal-content w-full max-w-md p-6 md:p-8 animate-scale-in text-center px-[29px] py-[29px]" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground">Mã Lớp</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Class Name */}
          <p className="text-muted-foreground mb-4">{className}</p>

          {/* Code Display */}
          <div className="bg-primary/10 rounded-2xl p-8 mb-6">
            <p className="font-mono text-5xl md:text-6xl font-bold text-primary tracking-[0.3em]">
              {code}
            </p>
          </div>

          {/* Copy Button */}
          <Button onClick={handleCopy} className="w-full btn-primary-gradient py-6 text-lg">
            {copied ? <>
                <Check className="w-5 h-5 mr-2" />
                Đã sao chép!
              </> : <>
                <Copy className="w-5 h-5 mr-2" />
                Sao chép mã
              </>}
          </Button>
        </div>
      </div>
    </div>;
};
export default CopyCodeModal;