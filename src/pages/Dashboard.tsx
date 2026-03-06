import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Scan, 
  LogOut, 
  Upload, 
  Images, 
  Search,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ImageUploader } from '@/components/ImageUploader';
import { FaceGallery } from '@/components/FaceGallery';
import { CompareResult } from '@/components/CompareResult';
import { 
  loadModels, 
  detectFace, 
  compareFaces, 
  descriptorToArray, 
  arrayToDescriptor 
} from '@/lib/faceapi';
import { toast } from 'sonner';

interface FaceImage {
  id: string;
  name: string;
  image_url: string;
  face_descriptor: number[] | null;
  file_size: number | null;
  created_at: string;
  matchScore?: number;
}

type DbFaceImage = {
  id: string;
  name: string;
  image_url: string;
  face_descriptor: unknown;
  file_size: number | null;
  created_at: string;
  user_id: string;
};

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'upload' | 'compare'>('upload');
  const [images, setImages] = useState<FaceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');

  // Compare state
  const [compareFile, setCompareFile] = useState<File | null>(null);
  const [comparePreviewUrl, setComparePreviewUrl] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareResults, setCompareResults] = useState<any[]>([]);

  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load face-api models
  useEffect(() => {
    const initModels = async () => {
      try {
        await loadModels();
        setModelsReady(true);
      } catch (error) {
        console.error('Error loading models:', error);
        toast.error('Không thể tải mô hình AI');
      } finally {
        setModelLoading(false);
      }
    };
    initModels();
  }, []);

  // Fetch images
  useEffect(() => {
    if (user) {
      fetchImages();
    }
  }, [user]);

  const fetchImages = async () => {
    try {
      const { data, error } = await supabase
        .from('face_images' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const typedData: FaceImage[] = ((data as any[]) || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        image_url: item.image_url,
        face_descriptor: item.face_descriptor as number[] | null,
        file_size: item.file_size,
        created_at: item.created_at,
      }));
      setImages(typedData);
    } catch (error) {
      console.error('Error fetching images:', error);
      toast.error('Không thể tải danh sách ảnh');
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (file: File, url: string) => {
    setSelectedFile(file);
    setPreviewUrl(url);
    setImageName(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleCompareImageSelect = (file: File, url: string) => {
    setCompareFile(file);
    setComparePreviewUrl(url);
    setCompareResults([]);
  };

  const clearUpload = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageName('');
  };

  const clearCompare = () => {
    setCompareFile(null);
    setComparePreviewUrl(null);
    setCompareResults([]);
  };

  const handleUpload = async () => {
    if (!selectedFile || !user || !modelsReady) return;

    setUploading(true);
    try {
      // Create image element for face detection
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = previewUrl!;
      });

      // Detect face and get descriptor
      const descriptor = await detectFace(img);
      if (!descriptor) {
        toast.error('Không phát hiện được khuôn mặt trong ảnh');
        setUploading(false);
        return;
      }

      // Upload file to storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('face-images')
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('face-images')
        .getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase.from('face_images').insert({
        user_id: user.id,
        name: imageName || selectedFile.name,
        image_url: urlData.publicUrl,
        face_descriptor: descriptorToArray(descriptor),
        file_size: selectedFile.size,
      });

      if (dbError) throw dbError;

      toast.success('Tải ảnh lên thành công!');
      clearUpload();
      fetchImages();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Không thể tải ảnh lên');
    } finally {
      setUploading(false);
    }
  };

  const handleCompare = async () => {
    if (!compareFile || !modelsReady || images.length === 0) return;

    setIsComparing(true);
    setCompareResults([]);

    try {
      // Create image element for face detection
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = comparePreviewUrl!;
      });

      // Detect face in uploaded image
      const sourceDescriptor = await detectFace(img);
      if (!sourceDescriptor) {
        toast.error('Không phát hiện được khuôn mặt trong ảnh');
        setIsComparing(false);
        return;
      }

      // Compare with all stored images
      const results = images
        .filter(image => image.face_descriptor)
        .map(image => {
          const storedDescriptor = arrayToDescriptor(image.face_descriptor!);
          const similarity = compareFaces(sourceDescriptor, storedDescriptor);
          return {
            id: image.id,
            name: image.name,
            image_url: image.image_url,
            similarity,
          };
        })
        .sort((a, b) => b.similarity - a.similarity);

      setCompareResults(results);
      
      const matchCount = results.filter(r => r.similarity >= 70).length;
      if (matchCount > 0) {
        toast.success(`Tìm thấy ${matchCount} khuôn mặt trùng khớp!`);
      } else {
        toast.info('Không tìm thấy khuôn mặt trùng khớp');
      }
    } catch (error) {
      console.error('Compare error:', error);
      toast.error('Không thể so sánh khuôn mặt');
    } finally {
      setIsComparing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const imageToDelete = images.find(img => img.id === id);
      if (!imageToDelete) return;

      // Delete from storage
      const fileName = imageToDelete.image_url.split('/').pop();
      if (fileName && user) {
        await supabase.storage
          .from('face-images')
          .remove([`${user.id}/${fileName}`]);
      }

      // Delete from database
      const { error } = await supabase
        .from('face_images')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setImages(images.filter(img => img.id !== id));
      toast.success('Đã xóa ảnh');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Không thể xóa ảnh');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Scan className="w-5 h-5 text-primary" />
            </div>
            <span className="font-display font-bold text-xl text-gradient">FaceAI</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>

      {/* Model loading indicator */}
      {modelLoading && (
        <div className="bg-primary/10 border-b border-primary/30">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm">Đang tải mô hình AI...</span>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8">
          <Button
            variant={activeTab === 'upload' ? 'default' : 'outline'}
            onClick={() => setActiveTab('upload')}
            className={activeTab === 'upload' ? 'btn-primary' : ''}
          >
            <Upload className="w-4 h-4 mr-2" />
            Tải ảnh lên
          </Button>
          <Button
            variant={activeTab === 'compare' ? 'default' : 'outline'}
            onClick={() => setActiveTab('compare')}
            className={activeTab === 'compare' ? 'btn-primary' : ''}
          >
            <Search className="w-4 h-4 mr-2" />
            So sánh khuôn mặt
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Panel - Action Area */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1"
          >
            <div className="glass-card p-6 sticky top-24">
              {activeTab === 'upload' ? (
                <>
                  <h2 className="text-xl font-display font-semibold mb-6 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" />
                    Tải ảnh vào kho lưu trữ
                  </h2>

                  <div className="space-y-4">
                    <ImageUploader
                      onImageSelect={handleImageSelect}
                      selectedImage={previewUrl}
                      onClear={clearUpload}
                      maxSize={50}
                      label="Chọn ảnh khuôn mặt"
                    />

                    {selectedFile && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <label className="text-sm font-medium text-foreground/80">
                          Tên ảnh
                        </label>
                        <Input
                          value={imageName}
                          onChange={(e) => setImageName(e.target.value)}
                          placeholder="Nhập tên cho ảnh"
                          className="mt-1.5 bg-secondary/50 border-border/50 focus:border-primary"
                        />
                      </motion.div>
                    )}

                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || uploading || !modelsReady}
                      className="w-full btn-primary"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Đang xử lý...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Tải lên & Phân tích
                        </>
                      )}
                    </Button>

                    {!modelsReady && !modelLoading && (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="w-4 h-4" />
                        Mô hình AI chưa sẵn sàng
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-display font-semibold mb-6 flex items-center gap-2">
                    <Search className="w-5 h-5 text-primary" />
                    So sánh khuôn mặt
                  </h2>

                  <div className="space-y-4">
                    <ImageUploader
                      onImageSelect={handleCompareImageSelect}
                      selectedImage={comparePreviewUrl}
                      onClear={clearCompare}
                      maxSize={50}
                      label="Ảnh cần so sánh"
                    />

                    <Button
                      onClick={handleCompare}
                      disabled={!compareFile || isComparing || !modelsReady || images.length === 0}
                      className="w-full btn-primary"
                    >
                      {isComparing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Đang so sánh...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          So sánh với kho lưu trữ
                        </>
                      )}
                    </Button>

                    {images.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center">
                        Chưa có ảnh trong kho lưu trữ để so sánh
                      </p>
                    )}
                  </div>

                  <CompareResult
                    sourceImage={comparePreviewUrl}
                    results={compareResults}
                    isComparing={isComparing}
                    onClose={() => setCompareResults([])}
                  />
                </>
              )}
            </div>
          </motion.div>

          {/* Right Panel - Gallery */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-2"
          >
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-semibold flex items-center gap-2">
                  <Images className="w-5 h-5 text-primary" />
                  Kho lưu trữ ({images.length} ảnh)
                </h2>
              </div>

              <FaceGallery
                images={compareResults.length > 0 
                  ? images.map(img => ({
                      ...img,
                      matchScore: compareResults.find(r => r.id === img.id)?.similarity
                    }))
                  : images
                }
                onDelete={handleDelete}
                loading={loading}
              />
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
