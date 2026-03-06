import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageUploaderProps {
  onImageSelect: (file: File, previewUrl: string) => void;
  selectedImage: string | null;
  onClear: () => void;
  maxSize?: number; // in MB
  label?: string;
}

export const ImageUploader = ({ 
  onImageSelect, 
  selectedImage, 
  onClear,
  maxSize = 50,
  label = "Tải ảnh lên"
}: ImageUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh');
      return;
    }

    // Check file size (convert to MB)
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSize) {
      setError(`Kích thước ảnh tối đa ${maxSize}MB`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    onImageSelect(file, previewUrl);
  }, [maxSize, onImageSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground/80">{label}</label>
      
      {!selectedImage ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer ${
            isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50 hover:bg-secondary/30'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
          
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <p className="text-foreground font-medium mb-1">
              Kéo thả ảnh vào đây
            </p>
            <p className="text-sm text-muted-foreground">
              hoặc click để chọn file (tối đa {maxSize}MB)
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-xl overflow-hidden border border-border group"
        >
          <img 
            src={selectedImage} 
            alt="Selected" 
            className="w-full h-64 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-destructive text-sm"
        >
          <AlertCircle className="w-4 h-4" />
          {error}
        </motion.div>
      )}
    </div>
  );
};
