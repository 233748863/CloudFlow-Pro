import React, { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  UserPlus,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCaptchaDialog } from '@/components/auth/AuthExperienceShell';
import { useAuth } from '@/context/AuthContext';
import { login as apiLogin, register as apiRegister } from '@/services/api/auth';
import { logger } from '@/utils/logger';
import './auth-page.css';

type AuthMode = 'login' | 'register';

type LoginFormState = {
  username: string;
  password: string;
};

type RegisterFormState = {
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
};

const resolveModeByPathname = (pathname: string): AuthMode =>
  pathname === '/register' ? 'register' : 'login';

export const AuthPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const routeMode = resolveModeByPathname(location.pathname);

  const [mode, setMode] = useState<AuthMode>(routeMode);
  const [captchaIntent, setCaptchaIntent] = useState<AuthMode | null>(null);
  const [pendingAction, setPendingAction] = useState<AuthMode | null>(null);
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [loginForm, setLoginForm] = useState<LoginFormState>({
    username: '',
    password: '',
  });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
  });

  useEffect(() => {
    if (routeMode !== mode) {
      setMode(routeMode);
    }
  }, [mode, routeMode]);

  const switchMode = (nextMode: AuthMode) => {
    setLoginError('');
    setRegisterError('');
    setMode(nextMode);
    navigate(nextMode === 'login' ? '/login' : '/register');
  };

  const handleLoginSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');

    if (!loginForm.username.trim() || !loginForm.password) {
      setLoginError('请输入账号和密码');
      return;
    }

    setCaptchaIntent('login');
  };

  const handleRegisterSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setRegisterError('');

    if (!registerForm.username.trim() || !registerForm.password || !registerForm.confirmPassword) {
      setRegisterError('请完整填写注册信息');
      return;
    }

    if (registerForm.password.length < 6) {
      setRegisterError('密码至少需要 6 个字符');
      return;
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterError('两次输入的密码不一致');
      return;
    }

    setCaptchaIntent('register');
  };

  const handleCaptchaVerify = async (token: string) => {
    const currentIntent = captchaIntent;
    setCaptchaIntent(null);

    if (!currentIntent) {
      return;
    }

    setPendingAction(currentIntent);

    try {
      if (currentIntent === 'login') {
        const response = await apiLogin(loginForm.username.trim(), loginForm.password, token);
        if (response?.token) {
          await login(response.token);
          toast.success('登录成功');
          navigate('/');
          return;
        }

        const errorMessage = '登录失败，未获取到有效凭证';
        setLoginError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      await apiRegister({
        username: registerForm.username.trim(),
        password: registerForm.password,
        confirmPassword: registerForm.confirmPassword,
        email: registerForm.email.trim(),
        captchaToken: token,
      });

      setLoginForm({
        username: registerForm.username.trim(),
        password: '',
      });
      setRegisterForm((prev) => ({
        ...prev,
        password: '',
        confirmPassword: '',
      }));
      toast.success('注册成功，请登录');
      switchMode('login');
    } catch (error: any) {
      if (currentIntent === 'login') {
        logger.error('Login error:', error);
        const errorMessage = error.message || '登录失败，请检查账号和密码';
        setLoginError(errorMessage);
        toast.error(errorMessage);
      } else {
        const errorMessage = error.message || '注册失败，请稍后重试';
        setRegisterError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setPendingAction(null);
    }
  };

  const isLogin = mode === 'login';

  return (
    <>
      <div className="cf-auth-page">
        <div className="cf-auth-grid" />
        <div className="cf-auth-glow cf-auth-glow--top" />
        <div className="cf-auth-glow cf-auth-glow--bottom" />

        <div className="cf-auth-content">
          <div className="cf-auth-brand">
            <div className="cf-auth-brand__logo">
              <img src="/icon.svg" alt="CloudFlow Pro" />
            </div>
            <h1 className="cf-auth-brand__title">CloudFlow Pro</h1>
            <p className="cf-auth-brand__subtitle">企业协同办公入口</p>
          </div>

          <div className="cf-auth-card">
            <div className="cf-auth-card__head">
              <h2>{isLogin ? '登录系统' : '创建账号'}</h2>
              <p>{isLogin ? '输入账号和密码继续使用' : '填写基础信息完成注册'}</p>
            </div>

            {isLogin ? (
              <form className="cf-auth-form" onSubmit={handleLoginSubmit}>
                <label className="cf-auth-field">
                  <span className="cf-auth-field__label">账号</span>
                  <div className="cf-auth-field__input">
                    <Users size={18} className="cf-auth-field__icon" />
                    <input
                      type="text"
                      value={loginForm.username}
                      onChange={(event) =>
                        setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                      placeholder="请输入账号"
                      autoComplete="username"
                      required
                    />
                  </div>
                </label>

                <label className="cf-auth-field">
                  <span className="cf-auth-field__label">密码</span>
                  <div className="cf-auth-field__input">
                    <Lock size={18} className="cf-auth-field__icon" />
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginForm.password}
                      onChange={(event) =>
                        setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="cf-auth-field__action"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                {loginError ? <div className="cf-auth-feedback">{loginError}</div> : null}

                <button
                  type="submit"
                  className="cf-auth-submit"
                  disabled={pendingAction === 'login'}
                >
                  {pendingAction === 'login' ? (
                    <>
                      <Loader2 size={18} className="cf-auth-spin" />
                      正在登录
                    </>
                  ) : (
                    <>
                      <LogIn size={18} />
                      登录
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form className="cf-auth-form" onSubmit={handleRegisterSubmit}>
                <label className="cf-auth-field">
                  <span className="cf-auth-field__label">用户名</span>
                  <div className="cf-auth-field__input">
                    <Users size={18} className="cf-auth-field__icon" />
                    <input
                      type="text"
                      value={registerForm.username}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                      placeholder="请输入用户名"
                      autoComplete="username"
                      required
                    />
                  </div>
                </label>

                <label className="cf-auth-field">
                  <span className="cf-auth-field__label">密码</span>
                  <div className="cf-auth-field__input">
                    <Lock size={18} className="cf-auth-field__icon" />
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      value={registerForm.password}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      placeholder="请输入密码"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="cf-auth-field__action"
                      onClick={() => setShowRegisterPassword((prev) => !prev)}
                      aria-label={showRegisterPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <label className="cf-auth-field">
                  <span className="cf-auth-field__label">确认密码</span>
                  <div className="cf-auth-field__input">
                    <Lock size={18} className="cf-auth-field__icon" />
                    <input
                      type={showRegisterConfirmPassword ? 'text' : 'password'}
                      value={registerForm.confirmPassword}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      placeholder="请再次输入密码"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="cf-auth-field__action"
                      onClick={() => setShowRegisterConfirmPassword((prev) => !prev)}
                      aria-label={showRegisterConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                    >
                      {showRegisterConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <span className="cf-auth-field__hint">至少 6 个字符</span>
                </label>

                <label className="cf-auth-field">
                  <span className="cf-auth-field__label">
                    邮箱 <em>(可选)</em>
                  </span>
                  <div className="cf-auth-field__input">
                    <Mail size={18} className="cf-auth-field__icon" />
                    <input
                      type="email"
                      value={registerForm.email}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                      }
                      placeholder="请输入邮箱（可选）"
                      autoComplete="email"
                    />
                  </div>
                </label>

                {registerError ? <div className="cf-auth-feedback">{registerError}</div> : null}

                <button
                  type="submit"
                  className="cf-auth-submit"
                  disabled={pendingAction === 'register'}
                >
                  {pendingAction === 'register' ? (
                    <>
                      <Loader2 size={18} className="cf-auth-spin" />
                      正在创建
                    </>
                  ) : (
                    <>
                      <UserPlus size={18} />
                      创建账号
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          <div className="cf-auth-bottom-link">
            {isLogin ? (
              <>
                还没有账号？
                <button type="button" onClick={() => switchMode('register')}>
                  注册
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button type="button" onClick={() => switchMode('login')}>
                  登录
                </button>
              </>
            )}
          </div>

          <div className="cf-auth-copyright">
            © 2026 CloudFlow Pro. All rights reserved.
          </div>
        </div>
      </div>

      <AuthCaptchaDialog
        open={captchaIntent !== null}
        title={captchaIntent === 'register' ? '完成注册前验证' : '完成登录前验证'}
        description={
          captchaIntent === 'register'
            ? '请先完成滑块验证码，验证通过后继续创建账号。'
            : '请先完成滑块验证码，验证通过后继续登录系统。'
        }
        onClose={() => setCaptchaIntent(null)}
        onVerify={handleCaptchaVerify}
      />
    </>
  );
};
