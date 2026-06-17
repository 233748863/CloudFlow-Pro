import React, { useEffect, useState, useRef } from 'react';
import { Building2, Eye, EyeOff, Loader2, Lock, LogIn, Mail, RefreshCcw, ShieldAlert, UserPlus, Users, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCaptchaDialog } from '@/components/auth/AuthExperienceShell';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
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

type SavedAccount = {
  tenantCode: string;
  username: string;
  tenantName?: string;
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
        <Building2 size={16} />
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
  
  // 💾 桌面端专属高级状态
  const [rememberMe, setRememberMe] = useState(true);
  const [accountHistory, setAccountHistory] = useState<SavedAccount[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState('');
  
  // ⚡ 桌面端高品质人机微交互状态
  const [isShaking, setIsShaking] = useState(false); // 颤抖动画
  const [capsLockActive, setCapsLockActive] = useState(false); // Caps Lock 检测

  // 🎯 光标自动聚焦组件引用
  const loginUsernameRef = useRef<HTMLInputElement>(null);
  const loginPasswordRef = useRef<HTMLInputElement>(null);
  const registerUsernameRef = useRef<HTMLInputElement>(null);

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

  // 💾 桌面端：初始化加载历史登录记录与自定义服务器 API 路径
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('cf_auth_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        setAccountHistory(parsed);
        
        // 🎯 智能自动聚焦链路：有历史账户时秒聚焦密码，否则聚焦账号
        if (mode === 'login') {
          if (parsed && parsed.length > 0) {
            setTimeout(() => loginPasswordRef.current?.focus(), 150);
          } else {
            setTimeout(() => loginUsernameRef.current?.focus(), 150);
          }
        }
      } else {
        if (mode === 'login') {
          setTimeout(() => loginUsernameRef.current?.focus(), 150);
        }
      }
    } catch (err) {
      logger.warn('加载历史登录账户失败:', err);
      if (mode === 'login') {
        setTimeout(() => loginUsernameRef.current?.focus(), 150);
      }
    }

    const savedApiUrl = localStorage.getItem('cf_custom_api_url') || '';
    setCustomApiUrl(savedApiUrl);
  }, [mode]);

  // 🎯 注册模式下的自动聚焦
  useEffect(() => {
    if (mode === 'register') {
      setTimeout(() => registerUsernameRef.current?.focus(), 150);
    }
  }, [mode]);

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

  // ⚡ 触发物理颤抖反馈
  const triggerShakeFeedback = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  // ⌨️ 大写锁定（Caps Lock）检测键盘方法
  const handlePasswordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const handleLoginSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');

    if (!loginForm.tenantCode) {
      setLoginError('请选择租户');
      triggerShakeFeedback();
      return;
    }

    if (!loginForm.username.trim() || !loginForm.password) {
      setLoginError('请输入账号和密码');
      triggerShakeFeedback();
      return;
    }

    setCaptchaIntent('login');
  };

  const handleRegisterSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setRegisterError('');

    if (!registerForm.tenantCode) {
      setRegisterError('请选择租户');
      triggerShakeFeedback();
      return;
    }

    if (!registerForm.username.trim() || !registerForm.password || !registerForm.confirmPassword) {
      setRegisterError('请完整填写注册信息');
      triggerShakeFeedback();
      return;
    }

    if (registerForm.password.length < 6) {
      setRegisterError('密码至少需要 6 个字符');
      triggerShakeFeedback();
      return;
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterError('两次输入的密码不一致');
      triggerShakeFeedback();
      return;
    }

    setCaptchaIntent('register');
  };

  // 💾 桌面端：保存历史登录账号
  const saveAccountHistory = (tenantCode: string, username: string) => {
    try {
      const historyStr = localStorage.getItem('cf_auth_history') || '[]';
      let history: SavedAccount[] = [];
      try {
        history = JSON.parse(historyStr);
      } catch {
        history = [];
      }
      if (!Array.isArray(history)) {
        history = [];
      }

      // 过滤重复
      history = history.filter((item) => !(item.tenantCode === tenantCode && item.username === username));
      
      const matchedTenant = tenantOptions.find((t) => t.tenantCode === tenantCode);
      history.unshift({
        tenantCode,
        username,
        tenantName: matchedTenant ? matchedTenant.tenantName : tenantCode,
      });

      // 最多保存 3 个历史账户
      const trimmedHistory = history.slice(0, 3);
      setAccountHistory(trimmedHistory);
      localStorage.setItem('cf_auth_history', JSON.stringify(trimmedHistory));
    } catch (err) {
      logger.warn('保存历史登录账号失败:', err);
    }
  };

  // 💾 桌面端：删除历史记录
  const handleDeleteHistory = (e: React.MouseEvent, tenantCode: string, username: string) => {
    e.stopPropagation();
    const filtered = accountHistory.filter((item) => !(item.tenantCode === tenantCode && item.username === username));
    setAccountHistory(filtered);
    localStorage.setItem('cf_auth_history', JSON.stringify(filtered));
    toast.success('已删除账号记录');
  };

  // 💾 桌面端：快速填充历史账号
  const handleSelectHistory = (item: SavedAccount) => {
    setLoginForm((prev) => ({
      ...prev,
      tenantCode: item.tenantCode,
      username: item.username,
    }));
    toast.success(`已填入账号: ${item.username}`);
    setTimeout(() => loginPasswordRef.current?.focus(), 100);
  };

  // 💾 桌面端：保存高级 API 网络网关地址
  const handleSaveCustomApiUrl = () => {
    const trimmed = customApiUrl.trim();
    if (trimmed) {
      localStorage.setItem('cf_custom_api_url', trimmed);
      toast.success('自定义服务器网关已保存，请重新加载或重启应用生效');
    } else {
      localStorage.removeItem('cf_custom_api_url');
      toast.success('已恢复系统默认网关');
    }
    setShowSettings(false);
  };

  // 🧹 桌面端高品质细节：一键清除当前输入框文本，并重新聚焦
  const handleClearField = (field: 'login-username' | 'register-username' | 'register-email') => {
    if (field === 'login-username') {
      setLoginForm((prev) => ({ ...prev, username: '' }));
      setTimeout(() => loginUsernameRef.current?.focus(), 50);
    } else if (field === 'register-username') {
      setRegisterForm((prev) => ({ ...prev, username: '' }));
      setTimeout(() => registerUsernameRef.current?.focus(), 50);
    } else if (field === 'register-email') {
      setRegisterForm((prev) => ({ ...prev, email: '' }));
    }
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
          // 桌面端：如果勾选了记住我，则将其记录到历史中
          if (rememberMe) {
            saveAccountHistory(loginForm.tenantCode, loginForm.username.trim());
          }

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
        triggerShakeFeedback(); // 接口鉴权失败触发抖动
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
      triggerShakeFeedback(); // 请求异常触发物理抖动
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
      <Button type="button" variant="soft" size="sm" className="cf-auth-retry-button" onClick={handleReloadTenants}>
        <RefreshCcw size={12} />
        重新加载
      </Button>
    </div>
  ) : null;

  return (
    <>
      <div className="cf-auth-page" onKeyDown={() => setCapsLockActive(false)}>
        {/* ==========================================
            [桌面端专享] 左侧高阶科技质感大屏展示区 
            ========================================== */}
        <div className="cf-auth-sidebar">
          <div className="cf-auth-sidebar-brand">
            <div className="cf-auth-sidebar-brand__logo">
              <img src="/icon.svg" alt="CloudFlow Pro Logo" className="cf-auth-sidebar-brand__image" />
            </div>
            <span className="cf-auth-sidebar-brand__title">CloudFlow Pro</span>
          </div>

          <div className="cf-auth-sidebar-promo">
            <h2 className="cf-auth-sidebar-promo__headline">开启高效的<br />社区协同办公新体验</h2>
            <p className="cf-auth-sidebar-promo__description">
              CloudFlow Pro 是多租户分布式社区云工作台。在这里您可以实现智能人事流程引擎、敏捷沟通、数据洞察，以及全自动安全加密的文件协作体系。
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="cf-auth-feature-badge">✓ 纯正桌面端</span>
              <span className="cf-auth-feature-badge">✓ 多租户隔离</span>
              <span className="cf-auth-feature-badge">✓ 自主流程引擎</span>
              <span className="cf-auth-feature-badge">✓ 全链路加密</span>
            </div>
          </div>

          <div className="cf-auth-sidebar-footer">
            <span>客户端版本 v0.1.0 · SSL 安全通信加密</span>
          </div>
        </div>

        {/* ==========================================
            右侧清爽核心表单容器区域（双端自适应）
            ========================================== */}
        <div className="cf-auth-main">
          <div className="cf-auth-grid" />

          {/* ⚡ 绑定 isShaking 动画状态 */}
          <div className={`cf-auth-card ${isShaking ? 'shake' : ''}`}>
            {/* 简易 Brand：仅在小窗口/小屏幕移动端下自适应显示，大屏幕则隐藏 */}
            <div className="cf-auth-brand">
              <div className="cf-auth-brand__logo">
                <img src="/icon.svg" alt="CloudFlow Pro" className="cf-auth-brand__image" />
              </div>
              <h1 className="cf-auth-brand__title">CloudFlow Pro</h1>
              <p className="cf-auth-brand__subtitle">社区协同办公统一入口</p>
            </div>

            <div className="cf-auth-card__section">
              {/* ==========================================
                  [极致桌面化重构]：去掉生硬大标题与说明
                  替换为高级、轻量化无刷双态 Tab 切换栏
                  ========================================== */}
              <div className="flex border-b border-slate-100 dark:border-slate-800/60 pb-3.5 mb-5 justify-start gap-6 relative">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`pb-1 text-[15px] font-bold transition-all relative no-min-size ${
                    isLogin 
                      ? 'text-teal-600 dark:text-teal-400 font-extrabold' 
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  账号登录
                  {isLogin && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-teal-600 dark:bg-teal-400 rounded-full animate-fade-in" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`pb-1 text-[15px] font-bold transition-all relative no-min-size ${
                    !isLogin 
                      ? 'text-teal-600 dark:text-teal-400 font-extrabold' 
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  加入我们
                  {!isLogin && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-teal-600 dark:bg-teal-400 rounded-full animate-fade-in" />
                  )}
                </button>

                {/* 桌面端特有：高级设置按钮（并排完美嵌入 Tab 右侧） */}
                <button
                  type="button"
                  onClick={() => setShowSettings((prev) => !prev)}
                  className="cf-auth-settings-btn"
                  style={{ top: '-0.125rem' }}
                  title="服务器连接设置"
                >
                  <Settings size={14} className={`transition-transform duration-300 ${showSettings ? 'rotate-90 text-teal-600' : ''}`} />
                </button>
              </div>

              {/* 展开的高级网关配置 */}
              {showSettings && (
                <div className="cf-auth-config-drawer mb-4">
                  <label className="cf-auth-label">API 服务器基准地址</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={customApiUrl}
                      onChange={(e) => setCustomApiUrl(e.target.value)}
                      placeholder="默认: 读取当前客户端配置"
                      className="cf-auth-input"
                      style={{ paddingLeft: '0.75rem' }}
                    />
                    <Button
                      type="button"
                      variant="soft"
                      size="sm"
                      onClick={handleSaveCustomApiUrl}
                      className="cf-auth-retry-button !h-10"
                    >
                      保存
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    适用于局域网、专有网络及私有部署环境。留空保存即恢复系统默认。
                  </p>
                </div>
              )}

              {/* 历史快速登录账号区（仅登录状态，且有记录时展示） */}
              {isLogin && accountHistory.length > 0 && (
                <div className="cf-auth-history">
                  <div className="cf-auth-history-title">最近登录账号</div>
                  <div className="cf-auth-history-list">
                    {accountHistory.map((item, idx) => (
                      <div
                        key={idx}
                        className="cf-auth-history-item"
                        onClick={() => handleSelectHistory(item)}
                      >
                        <div className="cf-auth-history-item__avatar">
                          {item.username[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="cf-auth-history-item__text max-w-[8rem] truncate">
                          {item.username}
                        </div>
                        <button
                          type="button"
                          className="cf-auth-history-item__delete"
                          onClick={(e) => handleDeleteHistory(e, item.tenantCode, item.username)}
                          title="删除记录"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isLogin ? (
                <form onSubmit={handleLoginSubmit} className="cf-auth-form">
                  <div>
                    <label className="cf-auth-label">租户</label>
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
                    <label htmlFor="auth-login-username" className="cf-auth-label">账号</label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Users size={16} />
                      </div>
                      <input
                        id="auth-login-username"
                        ref={loginUsernameRef}
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
                      {/* 🧹 一键清除按钮 */}
                      {loginForm.username && (
                        <button
                          type="button"
                          className="cf-auth-input-clear has-value"
                          onClick={() => handleClearField('login-username')}
                          title="清空账号"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-login-password" className="cf-auth-label">密码</label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Lock size={16} />
                      </div>
                      <input
                        id="auth-login-password"
                        ref={loginPasswordRef}
                        value={loginForm.password}
                        onChange={(event) =>
                          setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        onKeyDown={handlePasswordKeyDown}
                        onKeyUp={handlePasswordKeyDown}
                        type={showLoginPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        placeholder="请输入密码"
                        className="cf-auth-input cf-auth-input--password"
                      />
                      
                      {/* ⌨️ 经典大写锁定侦测徽标 */}
                      {capsLockActive && (
                        <span className="cf-auth-capslock-badge" title="大写锁定已开启">
                          A
                        </span>
                      )}

                      <button
                        type="button"
                        className="cf-auth-input-toggle"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                      >
                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* 记住我选框（桌面级登录必备） */}
                  <div className="cf-auth-remember">
                    <label className="cf-auth-remember__checkbox">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      记住我（下次自动填充账号与租户）
                    </label>
                  </div>

                  {currentError ? (
                    <div className="cf-auth-error">
                      <ShieldAlert size={16} className="cf-auth-error__icon" />
                      <p>{currentError}</p>
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={pendingAction === 'login'}
                    className="cf-auth-submit"
                  >
                    {pendingAction === 'login' ? (
                      <>
                        <Loader2 size={14} className="cf-auth-spin" />
                        正在登录
                      </>
                    ) : (
                      <>
                        <LogIn size={14} />
                        登录
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="cf-auth-form">
                  <div>
                    <label className="cf-auth-label">租户</label>
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
                    <label htmlFor="auth-register-username" className="cf-auth-label">用户名</label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Users size={16} />
                      </div>
                      <input
                        id="auth-register-username"
                        ref={registerUsernameRef}
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
                      {/* 🧹 一键清除按钮 */}
                      {registerForm.username && (
                        <button
                          type="button"
                          className="cf-auth-input-clear has-value"
                          onClick={() => handleClearField('register-username')}
                          title="清空用户名"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-register-password" className="cf-auth-label">密码</label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Lock size={16} />
                      </div>
                      <input
                        id="auth-register-password"
                        value={registerForm.password}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        onKeyDown={handlePasswordKeyDown}
                        onKeyUp={handlePasswordKeyDown}
                        type={showRegisterPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        placeholder="请输入密码"
                        className="cf-auth-input cf-auth-input--password"
                      />
                      
                      {/* ⌨️ 大写锁定提示 */}
                      {capsLockActive && (
                        <span className="cf-auth-capslock-badge" title="大写锁定已开启">
                          A
                        </span>
                      )}

                      <button
                        type="button"
                        className="cf-auth-input-toggle"
                        onClick={() => setShowRegisterPassword((prev) => !prev)}
                        aria-label={showRegisterPassword ? '隐藏密码' : '显示密码'}
                      >
                        {showRegisterPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="cf-auth-hint">至少 6 个字符</p>
                  </div>

                  <div>
                    <label htmlFor="auth-register-confirm" className="cf-auth-label">确认密码</label>
                    <div className="cf-auth-input-wrap">
                      <div className="cf-auth-input-icon">
                        <Lock size={16} />
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
                        onKeyDown={handlePasswordKeyDown}
                        onKeyUp={handlePasswordKeyDown}
                        type={showRegisterConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        placeholder="请再次输入密码"
                        className="cf-auth-input cf-auth-input--password"
                      />
                      
                      {/* ⌨️ 大写锁定提示 */}
                      {capsLockActive && (
                        <span className="cf-auth-capslock-badge" title="大写锁定已开启">
                          A
                        </span>
                      )}

                      <button
                        type="button"
                        className="cf-auth-input-toggle"
                        onClick={() => setShowRegisterConfirmPassword((prev) => !prev)}
                        aria-label={showRegisterConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                      >
                        {showRegisterConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
                        <Mail size={16} />
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
                      <ShieldAlert size={16} className="cf-auth-error__icon" />
                      <p>{currentError}</p>
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={pendingAction === 'register'}
                    className="cf-auth-submit"
                  >
                    {pendingAction === 'register' ? (
                      <>
                        <Loader2 size={14} className="cf-auth-spin" />
                        正在创建
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} />
                        创建账号
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
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
