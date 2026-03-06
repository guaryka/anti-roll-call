import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, User, Calendar, HardDrive, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface FaceImage {
  id: string;
  name: string;
  image_url: string;
  file_size: number | null;
  created_at: string;
  matchScore?: number;
}

interface FaceGalleryProps {
  images: FaceImage[];
  onDelete: (id: string) => void;
  loading?: boolean;
  selectedForCompare?: string[];
}

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const FaceGallery = ({ 
  images, 
  onDelete, 
  loading = false,
  selectedForCompare = []
}: FaceGalleryProps) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div 
            key={i} 
            className="aspect-square rounded-xl bg-secondary/50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-16"
      >
        <div className="w-20 h-20 rounded-2xl bg-secondary mx-auto flex items-center justify-center mb-4">
          <User className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">Chưa có ảnh nào</h3>
        <p className="text-muted-foreground">Tải ảnh lên để bắt đầu lưu trữ</p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <AnimatePresence mode="popLayout">
        {images.map((image, index) => (
          <motion.div
            key={image.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ delay: index * 0.05 }}
            className={`group relative rounded-xl overflow-hidden border transition-all duration-300 ${
              image.matchScore !== undefined 
                ? image.matchScore >= 70 
                  ? 'border-success ring-2 ring-success/30' 
                  : 'border-border'
                : selectedForCompare.includes(image.id)
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="aspect-square">
              <img
                src={image.image_url}
                alt={image.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Match score badge */}
            {image.matchScore !== undefined && (
              <div className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
                image.matchScore >= 70 
                  ? 'bg-success text-success-foreground' 
                  : image.matchScore >= 50 
                    ? 'bg-warning text-warning-foreground'
                    : 'bg-secondary text-secondary-foreground'
              }`}>
                {image.matchScore >= 70 && <CheckCircle2 className="w-3 h-3" />}
                {image.matchScore.toFixed(1)}%
              </div>
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white font-medium text-sm truncate mb-1">
                  {image.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-white/70">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(image.created_at), 'dd/MM/yyyy', { locale: vi })}
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {formatFileSize(image.file_size)}
                  </span>
                </div>
              </div>

              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 w-8 h-8"
                onClick={() => onDelete(image.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
