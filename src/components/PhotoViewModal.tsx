import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoViewModalProps {
  photoUrl: string;
  onClose: () => void;
}

const PhotoViewModal = ({ photoUrl, onClose }: PhotoViewModalProps) => {
  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = photoUrl;
    link.download = `attendance-${Date.now()}.jpg`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stop propagation on all events to prevent closing parent modals
  const handleContainerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 z-[100] animate-fade-in" 
      onClick={handleClose}
    >
      <div 
        className="absolute inset-0"
        onClick={handleContainerClick}
      >
        <div className="absolute top-4 right-4 flex items-center gap-2 z-[101]">
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
          >
            <Download className="w-5 h-5" />
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            onClick={handleClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div 
          className="h-full flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <img
            src={photoUrl}
            alt="Attendance photo"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  );
};

export default PhotoViewModal;
