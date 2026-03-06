import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Percent, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MatchResult {
  id: string;
  name: string;
  image_url: string;
  similarity: number;
}

interface CompareResultProps {
  sourceImage: string | null;
  results: MatchResult[];
  isComparing: boolean;
  onClose: () => void;
}

export const CompareResult = ({ 
  sourceImage, 
  results, 
  isComparing,
  onClose 
}: CompareResultProps) => {
  const hasMatch = results.some(r => r.similarity >= 70);
  const bestMatch = results.length > 0 ? results[0] : null;

  return (
    <AnimatePresence>
      {(isComparing || results.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="glass-card p-6 mt-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-display font-semibold">Kết quả so sánh</h3>
            {!isComparing && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Đóng
              </Button>
            )}
          </div>

          {isComparing ? (
            <div className="flex flex-col items-center py-8">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="w-16 h-16 rounded-full border-4 border-primary/30 border-t-primary mb-4"
              />
              <p className="text-muted-foreground">Đang phân tích khuôn mặt...</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 ${
                hasMatch ? 'bg-success/10 border border-success/30' : 'bg-destructive/10 border border-destructive/30'
              }`}>
                {hasMatch ? (
                  <CheckCircle2 className="w-8 h-8 text-success" />
                ) : (
                  <XCircle className="w-8 h-8 text-destructive" />
                )}
                <div>
                  <p className={`font-semibold ${hasMatch ? 'text-success' : 'text-destructive'}`}>
                    {hasMatch ? 'Tìm thấy khuôn mặt trùng khớp!' : 'Không tìm thấy khuôn mặt trùng khớp'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {results.length > 0 
                      ? `${results.filter(r => r.similarity >= 70).length}/${results.length} ảnh có độ tương đồng cao`
                      : 'Không có ảnh nào trong kho lưu trữ'}
                  </p>
                </div>
              </div>

              {/* Best match preview */}
              {bestMatch && sourceImage && (
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-primary">
                    <img src={sourceImage} alt="Source" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col items-center">
                    <ArrowRight className="w-6 h-6 text-primary mb-1" />
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                      bestMatch.similarity >= 70 
                        ? 'bg-success text-success-foreground' 
                        : 'bg-secondary text-secondary-foreground'
                    }`}>
                      {bestMatch.similarity.toFixed(1)}%
                    </div>
                  </div>
                  <div className={`w-24 h-24 rounded-xl overflow-hidden border-2 ${
                    bestMatch.similarity >= 70 ? 'border-success' : 'border-border'
                  }`}>
                    <img src={bestMatch.image_url} alt="Match" className="w-full h-full object-cover" />
                  </div>
                </div>
              )}

              {/* All results */}
              {results.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Tất cả kết quả (sắp xếp theo độ tương đồng)</p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {results.map((result, index) => (
                      <motion.div
                        key={result.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          result.similarity >= 70 
                            ? 'border-success/30 bg-success/5' 
                            : 'border-border bg-secondary/30'
                        }`}
                      >
                        <img 
                          src={result.image_url} 
                          alt={result.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{result.name}</p>
                        </div>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold ${
                          result.similarity >= 70 
                            ? 'bg-success/20 text-success' 
                            : result.similarity >= 50
                              ? 'bg-warning/20 text-warning'
                              : 'bg-secondary text-muted-foreground'
                        }`}>
                          <Percent className="w-3 h-3" />
                          {result.similarity.toFixed(1)}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
