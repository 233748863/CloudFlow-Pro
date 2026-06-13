import React, { useEffect, useState } from 'react';
import { Building2, Eye, EyeOff, Loader2, Lock, LogIn, Mail, RefreshCcw, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCaptchaDialog } from '@/components/auth/AuthExperienceShell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getTenantOptions, login as apiLogin, register as apiRegister, type TenantOption } from '@/services/api/auth';
import { logger } from '@/utils/logger';
import './auth-page.css';

type AuthMode = 'login' | 'register';

type LoginFormState = {
  tenantCode: string;
  username: string;
  password: string;
};

type RegisterFormState = {
  tenantCode: string;
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
};

const resolveModeByPathname = (pathname: string): AuthMode =>
  pathname === '/register' ? 'register' : 'login';

const TENANT_RETRY_WINDOW_MS = 30000;
const TENANT_RETRY_INTERVAL_MS = 2000;
const TENANT_REQUEST_TIMEOUT_MS = 5000;
const TENANT_LOAD_ERROR_MESSAGE = '后端服务暂未就绪，请确认服务已启动后重试';

type TenantSelectProps = {
  value: string;
  onChange: (tenantCode: string) => void;
  disabled: boolean;
  placeholder: string;
  options: TenantOption[];
};

const TenantSelect: React.FC<TenantSelectProps> = ({
  value,
  onChange,
  disabled,
  placeholder,
  options,
}) => (
  <div className="cf-auth-input-wrap">
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <div className="cf-auth-input-icon">
        <Building2 size={18} />
      </div>
      <SelectTrigger className="cf-auth-select-trigger">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((tenant) => (
          <SelectItem key={tenant.tenantCode} value={tenant.tenantCode}>
            {tenant.tenantName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export const AuthPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, user, loading } = useAuth();
  const routeMode = resolveModeByPathname(location.pathname);

  const [mode, setMode] = useState<AuthMode>(routeMode);
  const [captchaIntent, setCaptchaIntent] = useState<AuthMode | null>(null);
  const [pendingAction, setPendingAction] = useState<AuthMode | null>(null);
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantRetrying, setTenantRetrying] = useState(false);
  const [tenantLoadError, setTenantLoadError] = useState('');
  const [tenantReloadKey, setTenantReloadKey] = useState(0);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [loginForm, setLoginForm] = useState<LoginFormState>({
    tenantCode: '',
    username: '',
    password: '',
  });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    tenantCode: '',
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

  const resolveRedirectTarget = () => {
    const redirect = new URLSearchParams(location.search).get('redirect');
    return redirect && !['/login', '/register'].includes(redirect) ? redirect : '/';
  };

  useEffect(() => {
    if (loading || !user || user.forcePasswordChange) {
      return;
    }

    if (location.pathname === '/login' || location.pathname === '/register') {
      navigate(resolveRedirectTarget(), { replace: true });
    }
  }, [loading, user, location.pathname, location.search, navigate]);

  useEffect(() => {
    let active = true;
    let completed = false;
    let retryTimer: number | null = null;
    let deadlineTimer: number | null = null;
    const controllers = new Set<AbortController>();

    const stopTimers = () => {
      if (retryTimer !== null) {
        window.clearInterval(retryTimer);
        retryTimer = null;
      }
      if (deadlineTimer !== null) {
        window.clearTimeout(deadlineTimer);
        deadlineTimer = null;
      }
    };

    const abortPendingRequests = () => {
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };

    const finishWithOptions = (options: TenantOption[]) => {
      if (!active || completed) {
        return;
      }
      completed = true;
      stopTimers();
      abortPendingRequests();
      setTenantOptions(options);
      setTenantLoadError('');
      setTenantRetrying(false);
      setTenantLoading(false);
      if (options.length === 1) {
        const tenantCode = options[0].tenantCode;
        setLoginForm((prev) => ({ ...prev, tenantCode: prev.tenantCode || tenantCode }));
        setRegisterForm((prev) => ({ ...prev, tenantCode: prev.tenantCode || tenantCode }));
      }
    };

    const finishWithError = () => {
      if (!active || completed) {
        return;
      }
      completed = true;
      stopTimers();
      abortPendingRequests();
      setTenantLoadError(TENANT_LOAD_ERROR_MESSAGE);
      setTenantRetrying(false);
      setTenantLoading(false);
    };

    const loadTenants = async () => {
      if (!active || completed) {
        return;
      }

      const controller = new AbortController();
      controllers.add(controller);

      try {
        const options = await getTenantOptions({
          silent: true,
          timeout: TENANT_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        });
        finishWithOptions(options);
      } catch (error: any) {
        if (!active || completed || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
          return;
        }
        logger.warn('Load tenant options retry failed:', error);
      } finally {
        controllers.delete(controller);
      }
    };

    setTenantOptions([]);
    setTenantLoading(true);
    setTenantRetrying(true);
    setTenantLoadError('');

    void loadTenants();
    retryTimer = window.setInterval(() => {
      void loadTenants();
    }, TENANT_RETRY_INTERVAL_MS);
    deadlineTimer = window.setTimeout(finishWithError, TENANT_RETRY_WINDOW_MS);

    return () => {
      active = false;
      completed = true;
      stopTimers();
      abortPendingRequests();
    };
  }, [tenantReloadKey]);

  const switchMode = (nextMode: AuthMode) => {
    setLoginError('');
    setRegisterError('');
    setMode(nextMode);
    navigate(nextMode === 'login' ? '/login' : '/register');
  };

  const handleReloadTenants = () => {
    setTenantReloadKey((prev) => prev + 1);
  };

  const handleLoginSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');

    if (!loginForm.tenantCode) {
      setLoginError('请选择租户');
      return;
    }

    if (!loginForm.username.trim() || !loginForm.password) {
      setLoginError('请输入账号和密码');
      return;
    }

    setCaptchaIntent('login');
  };

  const handleRegisterSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setRegisterError('');

    if (!registerForm.tenantCode) {
      setRegisterError('请选择租户');
      return;
    }

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
        const response = await apiLogin(loginForm.tenantCode, loginForm.username.trim(), loginForm.password, token);
        if (response?.token) {
          await login(response.token);
          toast.success('登录成功');
          if (response.forcePasswordChange) {
            navigate('/login', { replace: true });
            return;
          }
          navigate(resolveRedirectTarget(), { replace: true });
          return;
        }

        const errorMessage = '登录失败，未获取到有效凭证';
        setLoginError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      await apiRegister({
        tenantCode: registerForm.tenantCode,
        username: registerForm.username.trim(),
        password: registerForm.password,
        confirmPassword: registerForm.confirmPassword,
        email: registerForm.email.trim(),
        captchaToken: token,
      });

      setLoginForm({
        tenantCode: registerForm.tenantCode,
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
  const currentError = isLogin ? loginError : registerError;
  const currentYear = new Date().getFullYear();
  const tenantSelectDisabled = tenantLoading || tenantOptions.length === 0;
  const tenantPlaceholder = tenantLoading ? '租户加载中' : tenantLoadError ? '租户加载失败' : '请选择租户';
  const tenantStatus = tenantRetrying ? (
    <p className="cf-auth-hint">后端服务启动中，正在自动重试</p>
  ) : tenantLoadError ? (
    <div className="cf-auth-tenant-status">
      <p className="cf-auth-hint cf-auth-hint--error">{tenantLoadError}</p>
      <button type="button" className="cf-auth-retry-button" onClick={handleReloadTenants}>
        <RefreshCcw size={14} />
        重新加载
      </button>
    </div>
  ) : null;

  return (
    <>
      <div className="cf-auth-page">
        <div className="cf-auth-bg" />
        <div className="cf-auth-decor">
          <div className="cf-auth-orb cf-auth-orb--top" />
          <div className="cf-auth-orb cf-auth-orb--bottom" />
          <div className="cf-auth-orb cf-auth-orb--center" />
          <div className="cf-auth-grid" />
        </div>

        <div className="cf-auth-container">
          <div className="cf-auth-brand">
            <div className="cf-auth-brand__logo">
              <img src="/icon.svg" alt="CloudFlow Pro" className="cf-auth-brand__image" />
            </div>
            <h1 className="cf-auth-brand__title">CloudFlow Pro</h1>
            <p className="cf-auth-brand__subtitle">社区协同办公统一入口</p>
          </div>

          <div className="cf-auth-card">
            <div className="cf-auth-card__section">
              <div className="cf-auth-card__header">
                <h2 className="cf-auth-card__title">{isLogin ? '欢迎回来' : '创建账号'}</h2>
                <p className="cf-auth-card__description">
                  {isLogin ? '登录以继续进入社区工作台' : '注册后开始使用社区工作台'}
                </p>
              </div>

              {isLogin ? (
                <form onSubmit={handleLoginSubmit} className="cf-auth-form">
                  <div>
                    <label className="cf-auth-label">
                      租户
                    </label>
                    <TenantSelect
                      value={loginForm.tenantCode}
                      onChange={(tenantCode) => setLoginForm((prev) => ({ ...prev, tenantCode }))}
                      disabled={tenantSelectDisabled}
                      placeholder={tenantPlaceholder}
                      options={tenantOptions}
                    />
                    {tenantStatus}
                  </div>

                  <div>
                    <label htmlFor="auth-login-username" className="cf-auth-label">
                      账号
                    </label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Users size={18} />
                      </div>
                      <input
                        id="auth-login-username"
                        value={loginForm.username}
                        onChange={(event) =>
                          setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                        }
                        type="text"
                        autoComplete="username"
                        required
                        placeholder="请输入账号"
                        className="cf-auth-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-login-password" className="cf-auth-label">
                      密码
                    </label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Lock size={18} />
                      </div>
                      <input
                        id="auth-login-password"
                        value={loginForm.password}
                        onChange={(event) =>
                          setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        type={showLoginPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        placeholder="请输入密码"
                        className="cf-auth-input cf-auth-input--password"
                      />
                      <button
                        type="button"
                        className="cf-auth-input-toggle"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                      >
                        {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {currentError ? (
                    <div className="cf-auth-error">
                      <ShieldAlert size={18} className="cf-auth-error__icon" />
                      <p>{currentError}</p>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={pendingAction === 'login'}
                    className="cf-auth-submit"
                  >
                    {pendingAction === 'login' ? (
                      <>
                        <Loader2 size={16} className="cf-auth-spin" />
                        正在登录
                      </>
                    ) : (
                      <>
                        <LogIn size={16} />
                        登录
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="cf-auth-form">
                  <div>
                    <label className="cf-auth-label">
                      租户
                    </label>
                    <TenantSelect
                      value={registerForm.tenantCode}
                      onChange={(tenantCode) => setRegisterForm((prev) => ({ ...prev, tenantCode }))}
                      disabled={tenantSelectDisabled}
                      placeholder={tenantPlaceholder}
                      options={tenantOptions}
                    />
                    {tenantStatus}
                  </div>

                  <div>
                    <label htmlFor="auth-register-username" className="cf-auth-label">
                      用户名
                    </label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Users size={18} />
                      </div>
                      <input
                        id="auth-register-username"
                        value={registerForm.username}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, username: event.target.value }))
                        }
                        type="text"
                        autoComplete="username"
                        required
                        placeholder="请输入用户名"
                        className="cf-auth-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-register-password" className="cf-auth-label">
                      密码
                    </label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Lock size={18} />
                      </div>
                      <input
                        id="auth-register-password"
                        value={registerForm.password}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        type={showRegisterPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        placeholder="请输入密码"
                        className="cf-auth-input cf-auth-input--password"
                      />
                      <button
                        type="button"
                        className="cf-auth-input-toggle"
                        onClick={() => setShowRegisterPassword((prev) => !prev)}
                        aria-label={showRegisterPassword ? '隐藏密码' : '显示密码'}
                      >
                        {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <p className="cf-auth-hint">至少 6 个字符</p>
                  </div>

                  <div>
                    <label htmlFor="auth-register-confirm" className="cf-auth-label">
                      确认密码
                    </label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Lock size={18} />
                      </div>
                      <input
                        id="auth-register-confirm"
                        value={registerForm.confirmPassword}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({
                            ...prev,
                            confirmPassword: event.target.value,
                          }))
                        }
                        type={showRegisterConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        placeholder="请再次输入密码"
                        className="cf-auth-input cf-auth-input--password"
                      />
                      <button
                        type="button"
                        className="cf-auth-input-toggle"
                        onClick={() => setShowRegisterConfirmPassword((prev) => !prev)}
                        aria-label={showRegisterConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                      >
                        {showRegisterConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-register-email" className="cf-auth-label">
                      邮箱
                      <span className="cf-auth-label__optional">（可选）</span>
                    </label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Mail size={18} />
                      </div>
                      <input
                        id="auth-register-email"
                        value={registerForm.email}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        type="email"
                        autoComplete="email"
                        placeholder="请输入邮箱（可选）"
                        className="cf-auth-input"
                      />
                    </div>
                  </div>

                  {currentError ? (
                    <div className="cf-auth-error">
                      <ShieldAlert size={18} className="cf-auth-error__icon" />
                      <p>{currentError}</p>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={pendingAction === 'register'}
                    className="cf-auth-submit"
                  >
                    {pendingAction === 'register' ? (
                      <>
                        <Loader2 size={16} className="cf-auth-spin" />
                        正在创建
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        创建账号
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="cf-auth-footer">
            {isLogin ? (
              <p>
                还没有账号？
                <button type="button" onClick={() => switchMode('register')} className="cf-auth-footer__link">
                  立即注册
                </button>
              </p>
            ) : (
              <p>
                已有账号？
                <button type="button" onClick={() => switchMode('login')} className="cf-auth-footer__link">
                  返回登录
                </button>
              </p>
            )}
          </div>

          <div className="cf-auth-copyright">© {currentYear} CloudFlow Pro. All rights reserved.</div>
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
