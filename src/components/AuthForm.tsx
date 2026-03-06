import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
  });

  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(formData.email, formData.password);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success('Đăng nhập thành công!');
        }
      } else {
        if (!formData.fullName.trim()) {
          toast.error('Vui lòng nhập họ tên');
          setLoading(false);
          return;
        }
        const { error } = await signUp(formData.email, formData.password, formData.fullName);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success('Đăng ký thành công! Vui lòng đăng nhập.');
          setIsLogin(true);
        }
      }
    } catch (error) {
      toast.error('Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-pattern relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <motion.div 
          className="text-center mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 mb-4 glow-effect">
            <Scan className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-gradient">FaceAI</h1>
          <p className="text-muted-foreground mt-2">Nhận diện khuôn mặt thông minh</p>
        </motion.div>

        {/* Form Card */}
        <motion.div 
          className="glass-card p-8"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {/* Tab Switcher */}
          <div className="flex mb-8 p-1 bg-secondary rounded-lg">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-300 ${
                isLogin 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Đăng nhập
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-300 ${
                !isLogin 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Đăng ký
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="fullName"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Label htmlFor="fullName" className="text-sm font-medium text-foreground/80">
                    Họ và tên
                  </Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Nhập họ tên của bạn"
                      className="pl-11 h-12 bg-secondary/50 border-border/50 focus:border-primary input-glow"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="email" className="text-sm font-medium text-foreground/80">
                Email
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                  className="pl-11 h-12 bg-secondary/50 border-border/50 focus:border-primary input-glow"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-medium text-foreground/80">
                Mật khẩu
              </Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="pl-11 pr-11 h-12 bg-secondary/50 border-border/50 focus:border-primary input-glow"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 btn-primary font-semibold text-base"
              disabled={loading}
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                />
              ) : isLogin ? (
                'Đăng nhập'
              ) : (
                'Đăng ký'
              )}
            </Button>
          </form>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Bảo mật bởi công nghệ nhận diện khuôn mặt AI
        </p>
      </motion.div>
    </div>
  );
};
