import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  LogIn,
  Mail,
  RefreshCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthCaptchaDialog } from '@/components/auth/AuthExperienceShell';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { TotpLoginModal } from '@/components/profile/TotpLoginModal';
import { useAuth } from '@/context/AuthContext';
import {
  getActiveLegalRelease,
  getLegalDocument,
  getTenantOptions,
  login as apiLogin,
  register as apiRegister,
  verifyTotpLogin,
  type LegalDocumentDetail,
  type LegalDocumentSummary,
  type LegalRelease,
  type TenantOption,
} from '@/services/api/auth';
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

type CloudChip = {
  tone: 'teal' | 'slate' | 'amber' | 'indigo';
  mark: string;
  name: string;
};

type TenantSelectProps = {
  value: string;
  onChange: (tenantCode: string) => void;
  disabled: boolean;
  placeholder: string;
  options: TenantOption[];
};

const resolveModeByPathname = (pathname: string): AuthMode =>
  pathname === '/register' ? 'register' : 'login';

const TENANT_RETRY_WINDOW_MS = 30000;
const TENANT_RETRY_INTERVAL_MS = 2000;
const TENANT_REQUEST_TIMEOUT_MS = 5000;
const TENANT_LOAD_ERROR_MESSAGE = '后端服务暂未就绪，请确认服务已启动后重试';

const cloudRows: CloudChip[][] = [
  [
    { tone: 'teal', mark: 'OA', name: '流程审批' },
    { tone: 'slate', mark: 'HR', name: '人事工作台' },
    { tone: 'amber', mark: 'CRM', name: '客户管理' },
    { tone: 'indigo', mark: 'API', name: '开放网关' },
  ],
  [
    { tone: 'slate', mark: 'WF', name: '工作流引擎' },
    { tone: 'teal', mark: 'SEC', name: '权限隔离' },
    { tone: 'amber', mark: 'DATA', name: '经营洞察' },
  ],
  [
    { tone: 'indigo', mark: 'DOC', name: '知识协同' },
    { tone: 'teal', mark: 'TASK', name: '任务中心' },
    { tone: 'slate', mark: 'OPS', name: '运维控制台' },
  ],
  [
    { tone: 'amber', mark: 'APP', name: '桌面客户端' },
    { tone: 'teal', mark: 'TEN', name: '多租户' },
    { tone: 'indigo', mark: 'SYNC', name: '离线同步' },
    { tone: 'slate', mark: 'AUDIT', name: '审计日志' },
  ],
  [
    { tone: 'teal', mark: 'FORM', name: '表单设计' },
    { tone: 'slate', mark: 'ROLE', name: '角色授权' },
    { tone: 'amber', mark: 'FILE', name: '文件协作' },
  ],
  [
    { tone: 'indigo', mark: 'BI', name: '指标分析' },
    { tone: 'teal', mark: 'MSG', name: '消息通知' },
    { tone: 'slate', mark: 'MOB', name: '移动适配' },
  ],
];

const fallbackAgreementDocuments: LegalDocumentSummary[] = [
  { docType: 'terms', title: '服务条款' },
  { docType: 'privacy', title: '隐私政策' },
  { docType: 'security', title: '安全规范' },
  { docType: 'regions', title: '部署与支持范围' },
];

const normalizeDocumentType = (doc: LegalDocumentSummary) =>
  doc.docType || '';

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

const AuthModelCloud = () => {
  const bands = [cloudRows.slice(0, 3), cloudRows.slice(3)];

  return (
    <div className="cf-auth-model-cloud" aria-hidden="true">
      {bands.map((band, bandIndex) => (
        <div
          key={bandIndex}
          className={`cf-auth-model-band ${bandIndex === 0 ? 'is-top' : 'is-bottom'}`}
        >
          {band.map((row, rowIndex) => (
            <div
              key={`${bandIndex}-${rowIndex}`}
              className={`cf-auth-model-row ${(bandIndex + rowIndex) % 2 === 1 ? 'is-offset' : ''}`}
            >
              {[...row, ...row].map((item, itemIndex) => (
                <span
                  key={`${bandIndex}-${rowIndex}-${itemIndex}-${item.mark}-${item.name}`}
                  className="cf-auth-model-chip"
                >
                  <span className={`cf-auth-provider-mark is-${item.tone}`}>{item.mark}</span>
                  <span>{item.name}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const AuthPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, user, loading } = useAuth();
  const routeMode = resolveModeByPathname(location.pathname);

  const [mode, setMode] = useState<AuthMode>(routeMode);
  const [captchaIntent, setCaptchaIntent] = useState<AuthMode | null>(null);
  const [pendingAction, setPendingAction] = useState<AuthMode | null>(null);
  const [loginError, setLoginError] = useState('');
  const [totpChallenge, setTotpChallenge] = useState<{ tempToken: string; userEmailMasked?: string } | null>(null);
  const [totpSubmitting, setTotpSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantRetrying, setTenantRetrying] = useState(false);
  const [tenantLoadError, setTenantLoadError] = useState('');
  const [tenantReloadKey, setTenantReloadKey] = useState(0);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [accountHistory, setAccountHistory] = useState<SavedAccount[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [publicAccepted, setPublicAccepted] = useState(false);
  const [agreementVisible, setAgreementVisible] = useState(true);
  const [legalRelease, setLegalRelease] = useState<LegalRelease | null>(null);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalError, setLegalError] = useState('');
  const [activeLegalDocument, setActiveLegalDocument] = useState<LegalDocumentDetail | null>(null);
  const [legalDocumentLoading, setLegalDocumentLoading] = useState(false);
  const [legalDocumentError, setLegalDocumentError] = useState('');

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

  const selectedTenantCode = (mode === 'login' ? loginForm.tenantCode : registerForm.tenantCode)
    || loginForm.tenantCode
    || registerForm.tenantCode;
  const agreementDocuments = legalRelease?.documents?.length
    ? legalRelease.documents
    : fallbackAgreementDocuments;

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
    try {
      const savedHistory = localStorage.getItem('cf_auth_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        setAccountHistory(Array.isArray(parsed) ? parsed : []);

        if (mode === 'login') {
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTimeout(() => loginPasswordRef.current?.focus(), 150);
          } else {
            setTimeout(() => loginUsernameRef.current?.focus(), 150);
          }
        }
      } else if (mode === 'login') {
        setTimeout(() => loginUsernameRef.current?.focus(), 150);
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

  useEffect(() => {
    let active = true;
    const loadLegalRelease = async () => {
      setLegalLoading(true);
      setLegalError('');
      try {
        const release = await getActiveLegalRelease(selectedTenantCode || undefined);
        if (!active) {
          return;
        }
        setLegalRelease(release);
        setAgreementAccepted(false);
        setPublicAccepted(false);
        setAgreementVisible(true);
      } catch (error: any) {
        if (!active) {
          return;
        }
        logger.warn('加载条款配置失败:', error);
        setLegalRelease(null);
        setAgreementAccepted(false);
        setPublicAccepted(false);
        setAgreementVisible(true);
        setLegalError(error?.message || '条款暂未配置，请联系管理员');
      } finally {
        if (active) {
          setLegalLoading(false);
        }
      }
    };

    void loadLegalRelease();
    return () => {
      active = false;
    };
  }, [selectedTenantCode]);

  const switchMode = (nextMode: AuthMode) => {
    setLoginError('');
    setRegisterError('');
    setCapsLockActive(false);
    setMode(nextMode);
    navigate(nextMode === 'login' ? '/login' : '/register');
  };

  const handleReloadTenants = () => {
    setTenantReloadKey((prev) => prev + 1);
  };

  const triggerShakeFeedback = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const ensureAgreementReady = (intent: AuthMode) => {
    if (legalLoading) {
      const message = '条款配置加载中，请稍后再试';
      if (intent === 'login') {
        setLoginError(message);
      } else {
        setRegisterError(message);
      }
      triggerShakeFeedback();
      return false;
    }

    if (!legalRelease?.releaseCode) {
      const message = legalError || '条款暂未配置，请联系管理员';
      if (intent === 'login') {
        setLoginError(message);
      } else {
        setRegisterError(message);
      }
      setAgreementVisible(true);
      triggerShakeFeedback();
      return false;
    }

    if (!agreementAccepted) {
      const message = intent === 'register' ? '继续注册前需要先同意最新条款' : '继续登录前需要先同意最新条款';
      if (intent === 'login') {
        setLoginError(message);
      } else {
        setRegisterError(message);
      }
      setAgreementVisible(true);
      triggerShakeFeedback();
      return false;
    }

    if (!publicAccepted) {
      const message = '请先勾选已阅读并同意服务协议';
      if (intent === 'login') {
        setLoginError(message);
      } else {
        setRegisterError(message);
      }
      triggerShakeFeedback();
      return false;
    }

    return true;
  };

  const handlePasswordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const handleLoginSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');

    if (!ensureAgreementReady('login')) {
      return;
    }

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

    if (!ensureAgreementReady('register')) {
      return;
    }

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

      history = history.filter((item) => !(item.tenantCode === tenantCode && item.username === username));

      const matchedTenant = tenantOptions.find((t) => t.tenantCode === tenantCode);
      history.unshift({
        tenantCode,
        username,
        tenantName: matchedTenant ? matchedTenant.tenantName : tenantCode,
      });

      const trimmedHistory = history.slice(0, 3);
      setAccountHistory(trimmedHistory);
      localStorage.setItem('cf_auth_history', JSON.stringify(trimmedHistory));
    } catch (err) {
      logger.warn('保存历史登录账号失败:', err);
    }
  };

  const handleDeleteHistory = (e: React.MouseEvent, tenantCode: string, username: string) => {
    e.stopPropagation();
    const filtered = accountHistory.filter((item) => !(item.tenantCode === tenantCode && item.username === username));
    setAccountHistory(filtered);
    localStorage.setItem('cf_auth_history', JSON.stringify(filtered));
    toast.success('已删除账号记录');
  };

  const handleSelectHistory = (item: SavedAccount) => {
    setLoginForm((prev) => ({
      ...prev,
      tenantCode: item.tenantCode,
      username: item.username,
    }));
    toast.success(`已填入账号: ${item.username}`);
    setTimeout(() => loginPasswordRef.current?.focus(), 100);
  };

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
        const response = await apiLogin(
          loginForm.tenantCode,
          loginForm.username.trim(),
          loginForm.password,
          token,
          legalRelease?.releaseCode,
        );
        if (response?.requiresTotp && response.tempToken) {
          setTotpChallenge({
            tempToken: response.tempToken,
            userEmailMasked: response.userEmailMasked,
          });
          return;
        }
        if (response?.token) {
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
        triggerShakeFeedback();
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
        legalReleaseCode: legalRelease?.releaseCode,
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
      triggerShakeFeedback();
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

  const handleTotpVerify = async (code: string) => {
    if (!totpChallenge) return;

    setTotpSubmitting(true);
    try {
      const response = await verifyTotpLogin(totpChallenge.tempToken, code);
      if (!response?.token) {
        throw new Error('登录失败，未获取到有效凭证');
      }
      if (rememberMe) {
        saveAccountHistory(loginForm.tenantCode, loginForm.username.trim());
      }
      await login(response.token);
      setTotpChallenge(null);
      toast.success('登录成功');
      if (response.forcePasswordChange) {
        navigate('/login', { replace: true });
        return;
      }
      navigate(resolveRedirectTarget(), { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : '验证码错误，请重新登录后重试';
      // 验证码错误时后端已作废临时凭证，必须退回登录页重新走密码校验
      setTotpChallenge(null);
      setLoginForm((current) => ({ ...current, password: '' }));
      toast.error(message);
      setTimeout(() => loginPasswordRef.current?.focus(), 100);
    } finally {
      setTotpSubmitting(false);
    }
  };

  const closeTotpLogin = () => {
    if (totpSubmitting) return;
    setTotpChallenge(null);
    setLoginForm((current) => ({ ...current, password: '' }));
    setTimeout(() => loginPasswordRef.current?.focus(), 100);
  };

  const acceptAgreement = () => {
    if (legalLoading) {
      toast.info('条款配置加载中，请稍后再试');
      return;
    }
    if (!legalRelease?.releaseCode) {
      toast.error(legalError || '条款暂未配置，请联系管理员');
      return;
    }
    setAgreementAccepted(true);
    setAgreementVisible(false);
    setLoginError('');
    setRegisterError('');
  };

  const rejectAgreement = () => {
    setAgreementAccepted(false);
    setPublicAccepted(false);
    setAgreementVisible(false);
  };

  const openLegalDocument = async (doc: LegalDocumentSummary) => {
    const docType = normalizeDocumentType(doc);
    if (!docType || !legalRelease?.releaseCode) {
      toast.error('条款暂未配置，请联系管理员');
      return;
    }

    setLegalDocumentLoading(true);
    setLegalDocumentError('');
    setActiveLegalDocument(null);
    try {
      const detail = await getLegalDocument(legalRelease.releaseCode, docType, selectedTenantCode || undefined);
      setActiveLegalDocument(detail);
    } catch (error: any) {
      logger.warn('加载条款文档失败:', error);
      setLegalDocumentError(error?.message || `${doc.title}暂未配置`);
    } finally {
      setLegalDocumentLoading(false);
    }
  };

  const handleAgreementLinkClick = (docType: string) => {
    const doc = agreementDocuments.find((item) => normalizeDocumentType(item) === docType);
    if (!doc) {
      toast.error('条款暂未配置，请联系管理员');
      return;
    }
    void openLegalDocument(doc);
  };

  const handlePlaceholderAction = (label: string) => {
    toast.info(`${label}暂未配置`);
  };

  const isLogin = mode === 'login';
  const currentError = isLogin ? loginError : registerError;
  const currentYear = new Date().getFullYear();
  const formsDisabled = !agreementAccepted;
  const tenantSelectDisabled = formsDisabled || tenantLoading || tenantOptions.length === 0;
  const tenantPlaceholder = tenantLoading ? '租户加载中' : tenantLoadError ? '租户加载失败' : '请选择租户';
  const canSubmit = agreementAccepted
    && publicAccepted
    && Boolean(legalRelease?.releaseCode)
    && !legalLoading
    && !legalError
    && pendingAction === null;
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
      <div className={`cf-auth-page ${isLogin ? 'is-login' : 'is-register'}`}>
        <AuthModelCloud />

        <header className="cf-auth-header">
          <nav className="cf-auth-nav" aria-label="认证页导航">
            <button type="button" className="cf-auth-brand-link" onClick={() => navigate('/')} aria-label="返回 CloudFlow Pro">
              <span className="cf-auth-brand-mark">
                <img src="/icon.svg" alt="" />
              </span>
              <span className="cf-auth-brand-text">CloudFlow Pro</span>
            </button>

          </nav>
        </header>

        <main className="cf-auth-main">
          <section className="cf-auth-intro" aria-label="CloudFlow Pro">
            <p className="cf-auth-kicker">企业协同云工作台</p>
            <h1>继续使用 CloudFlow Pro</h1>
            <p>
              用统一入口连接流程审批、人事服务、客户协作和经营数据，让团队在同一套权限和租户边界内完成日常工作。
            </p>
            <div className="cf-auth-proof-list">
              <span><Check size={15} /> 多租户隔离</span>
              <span><Check size={15} /> 流程引擎</span>
              <span><Check size={15} /> 桌面客户端</span>
            </div>
          </section>

          <section className="cf-auth-panel-section" aria-label={isLogin ? '登录' : '注册'}>
            <div className={`cf-auth-panel ${isShaking ? 'shake' : ''}`}>
              <div className="cf-auth-form">
                <div className="cf-auth-form-head">
                  <div>
                    <h2>{isLogin ? '欢迎回来' : '创建账户'}</h2>
                    <p>{isLogin ? '登录你的账号以继续使用工作台。' : '加入 CloudFlow Pro，开始协同办公。'}</p>
                  </div>
                  <button
                    type="button"
                    className="cf-auth-settings-btn"
                    data-tooltip="服务器连接设置"
                    aria-label="服务器连接设置"
                    aria-expanded={showSettings}
                    onClick={() => setShowSettings((prev) => !prev)}
                  >
                    <Settings size={16} />
                  </button>
                </div>

                <div className="cf-auth-mode-tabs" role="tablist" aria-label="认证方式">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isLogin}
                    className={isLogin ? 'active' : ''}
                    onClick={() => switchMode('login')}
                  >
                    账号登录
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isLogin}
                    className={!isLogin ? 'active' : ''}
                    onClick={() => switchMode('register')}
                  >
                    加入我们
                  </button>
                </div>

                {showSettings ? (
                  <div className="cf-auth-config-drawer">
                    <label className="cf-auth-label" htmlFor="cf-auth-api-url">API 服务器基准地址</label>
                    <div className="cf-auth-config-row">
                      <input
                        id="cf-auth-api-url"
                        type="text"
                        value={customApiUrl}
                        onChange={(e) => setCustomApiUrl(e.target.value)}
                        placeholder="默认读取当前客户端配置"
                        className="cf-auth-input cf-auth-input--plain"
                      />
                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        onClick={handleSaveCustomApiUrl}
                        className="cf-auth-retry-button"
                      >
                        保存
                      </Button>
                    </div>
                    <p>适用于局域网、专有网络及私有部署环境。留空保存即恢复系统默认。</p>
                  </div>
                ) : null}

                {isLogin && accountHistory.length > 0 ? (
                  <div className="cf-auth-history">
                    <div className="cf-auth-history-title">最近登录账号</div>
                    <div className="cf-auth-history-list">
                      {accountHistory.map((item) => (
                        <div
                          key={`${item.tenantCode}-${item.username}`}
                          className="cf-auth-history-item"
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectHistory(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              handleSelectHistory(item);
                            }
                          }}
                        >
                          <span className="cf-auth-history-item__avatar">
                            {item.username[0]?.toUpperCase() || 'U'}
                          </span>
                          <span className="cf-auth-history-item__body">
                            <span>{item.username}</span>
                            <small>{item.tenantName || item.tenantCode}</small>
                          </span>
                          <button
                            type="button"
                            className="cf-auth-history-item__delete"
                            onClick={(e) => handleDeleteHistory(e, item.tenantCode, item.username)}
                            aria-label="删除账号记录"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {isLogin ? (
                  <form onSubmit={handleLoginSubmit} className="cf-auth-source-form">
                    <label className="cf-auth-field-block">
                      <span className="cf-auth-label">租户</span>
                      <TenantSelect
                        value={loginForm.tenantCode}
                        onChange={(tenantCode) => setLoginForm((prev) => ({ ...prev, tenantCode }))}
                        disabled={tenantSelectDisabled}
                        placeholder={tenantPlaceholder}
                        options={tenantOptions}
                      />
                      {tenantStatus}
                    </label>

                    <label className="cf-auth-field-block" htmlFor="auth-login-username">
                      <span className="cf-auth-label">账号</span>
                      <span className="cf-auth-input-wrap">
                        <span className="cf-auth-input-icon">
                          <Users size={16} />
                        </span>
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
                          disabled={formsDisabled}
                          placeholder="请输入账号"
                          className="cf-auth-input"
                        />
                        {loginForm.username ? (
                          <button
                            type="button"
                            className="cf-auth-input-clear has-value"
                            onClick={() => handleClearField('login-username')}
                            data-tooltip="清空账号" aria-label="清空账号"
                            disabled={formsDisabled}
                          >
                            x
                          </button>
                        ) : null}
                      </span>
                    </label>

                    <label className="cf-auth-field-block" htmlFor="auth-login-password">
                      <span className="cf-auth-label">密码</span>
                      <span className="cf-auth-input-wrap">
                        <span className="cf-auth-input-icon">
                          <Lock size={16} />
                        </span>
                        <input
                          id="auth-login-password"
                          ref={loginPasswordRef}
                          value={loginForm.password}
                          onChange={(event) =>
                            setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                          }
                          onKeyDown={handlePasswordKeyDown}
                          onKeyUp={handlePasswordKeyDown}
                          onBlur={() => setCapsLockActive(false)}
                          type={showLoginPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          disabled={formsDisabled}
                          placeholder="请输入密码"
                          className="cf-auth-input cf-auth-input--password"
                        />
                        {capsLockActive ? (
                          <span className="cf-auth-capslock-badge" data-tooltip="大写锁定已开启">
                            A
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="cf-auth-input-toggle"
                          onClick={() => setShowLoginPassword((prev) => !prev)}
                          aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                          disabled={formsDisabled}
                        >
                          {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                      <span className="cf-auth-forgot-row">
                        <span />
                        <button type="button" onClick={() => handlePlaceholderAction('密码找回')}>
                          忘记密码？
                        </button>
                      </span>
                    </label>

                    <label className="cf-auth-remember">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={formsDisabled}
                      />
                      <span>记住账号与租户</span>
                    </label>

                    {!agreementAccepted ? (
                      <div className="cf-auth-agreement-inline">
                        <div>
                          <p>继续登录前需要先同意最新条款。</p>
                          <span>未同意前，账号密码输入和快捷登录会保持禁用。</span>
                        </div>
                        <button type="button" onClick={() => setAgreementVisible(true)}>查看条款</button>
                      </div>
                    ) : null}

                    <label className="cf-auth-public-agreement">
                      <input
                        type="checkbox"
                        checked={publicAccepted}
                        onChange={(event) => setPublicAccepted(event.target.checked)}
                        disabled={!agreementAccepted}
                      />
                      <span>
                        我已阅读并同意
                        <button type="button" onClick={() => handleAgreementLinkClick('terms')}>服务条款</button>、
                        <button type="button" onClick={() => handleAgreementLinkClick('privacy')}>隐私政策</button>、
                        <button type="button" onClick={() => handleAgreementLinkClick('security')}>安全规范</button>
                      </span>
                    </label>

                    {currentError ? (
                      <div className="cf-auth-error">
                        <ShieldAlert size={16} className="cf-auth-error__icon" />
                        <p>{currentError}</p>
                      </div>
                    ) : null}

                    <Button
                      type="submit"
                      disabled={!canSubmit || pendingAction === 'login'}
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
                  <form onSubmit={handleRegisterSubmit} className="cf-auth-source-form">
                    <label className="cf-auth-field-block">
                      <span className="cf-auth-label">租户</span>
                      <TenantSelect
                        value={registerForm.tenantCode}
                        onChange={(tenantCode) => setRegisterForm((prev) => ({ ...prev, tenantCode }))}
                        disabled={tenantSelectDisabled}
                        placeholder={tenantPlaceholder}
                        options={tenantOptions}
                      />
                      {tenantStatus}
                    </label>

                    <label className="cf-auth-field-block" htmlFor="auth-register-username">
                      <span className="cf-auth-label">用户名</span>
                      <span className="cf-auth-input-wrap">
                        <span className="cf-auth-input-icon">
                          <Users size={16} />
                        </span>
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
                          disabled={formsDisabled}
                          placeholder="请输入用户名"
                          className="cf-auth-input"
                        />
                        {registerForm.username ? (
                          <button
                            type="button"
                            className="cf-auth-input-clear has-value"
                            onClick={() => handleClearField('register-username')}
                            data-tooltip="清空用户名" aria-label="清空用户名"
                            disabled={formsDisabled}
                          >
                            x
                          </button>
                        ) : null}
                      </span>
                    </label>

                    <label className="cf-auth-field-block" htmlFor="auth-register-password">
                      <span className="cf-auth-label">密码</span>
                      <span className="cf-auth-input-wrap">
                        <span className="cf-auth-input-icon">
                          <Lock size={16} />
                        </span>
                        <input
                          id="auth-register-password"
                          value={registerForm.password}
                          onChange={(event) =>
                            setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                          }
                          onKeyDown={handlePasswordKeyDown}
                          onKeyUp={handlePasswordKeyDown}
                          onBlur={() => setCapsLockActive(false)}
                          type={showRegisterPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          disabled={formsDisabled}
                          placeholder="至少 6 位字符"
                          className="cf-auth-input cf-auth-input--password"
                        />
                        {capsLockActive ? (
                          <span className="cf-auth-capslock-badge" data-tooltip="大写锁定已开启">
                            A
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="cf-auth-input-toggle"
                          onClick={() => setShowRegisterPassword((prev) => !prev)}
                          aria-label={showRegisterPassword ? '隐藏密码' : '显示密码'}
                          disabled={formsDisabled}
                        >
                          {showRegisterPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                      <span className="cf-auth-hint">建议包含大小写字母、数字和符号。</span>
                    </label>

                    <label className="cf-auth-field-block" htmlFor="auth-register-confirm">
                      <span className="cf-auth-label">确认密码</span>
                      <span className="cf-auth-input-wrap">
                        <span className="cf-auth-input-icon">
                          <Lock size={16} />
                        </span>
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
                          onBlur={() => setCapsLockActive(false)}
                          type={showRegisterConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          disabled={formsDisabled}
                          placeholder="请再次输入密码"
                          className="cf-auth-input cf-auth-input--password"
                        />
                        {capsLockActive ? (
                          <span className="cf-auth-capslock-badge" data-tooltip="大写锁定已开启">
                            A
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="cf-auth-input-toggle"
                          onClick={() => setShowRegisterConfirmPassword((prev) => !prev)}
                          aria-label={showRegisterConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                          disabled={formsDisabled}
                        >
                          {showRegisterConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                    </label>

                    <label className="cf-auth-field-block" htmlFor="auth-register-email">
                      <span className="cf-auth-label">
                        邮箱 <em>可选</em>
                      </span>
                      <span className="cf-auth-input-wrap">
                        <span className="cf-auth-input-icon">
                          <Mail size={16} />
                        </span>
                        <input
                          id="auth-register-email"
                          value={registerForm.email}
                          onChange={(event) =>
                            setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          type="email"
                          autoComplete="email"
                          disabled={formsDisabled}
                          placeholder="请输入邮箱"
                          className="cf-auth-input"
                        />
                        {registerForm.email ? (
                          <button
                            type="button"
                            className="cf-auth-input-clear has-value"
                            onClick={() => handleClearField('register-email')}
                            data-tooltip="清空邮箱" aria-label="清空邮箱"
                            disabled={formsDisabled}
                          >
                            x
                          </button>
                        ) : null}
                      </span>
                    </label>

                    {!agreementAccepted ? (
                      <div className="cf-auth-agreement-inline">
                        <div>
                          <p>继续注册前需要先同意最新条款。</p>
                          <span>未同意前，注册和快捷登录会保持禁用。</span>
                        </div>
                        <button type="button" onClick={() => setAgreementVisible(true)}>查看条款</button>
                      </div>
                    ) : null}

                    <label className="cf-auth-public-agreement">
                      <input
                        type="checkbox"
                        checked={publicAccepted}
                        onChange={(event) => setPublicAccepted(event.target.checked)}
                        disabled={!agreementAccepted}
                      />
                      <span>
                        我已阅读并同意
                        <button type="button" onClick={() => handleAgreementLinkClick('terms')}>服务条款</button>、
                        <button type="button" onClick={() => handleAgreementLinkClick('privacy')}>隐私政策</button>、
                        <button type="button" onClick={() => handleAgreementLinkClick('security')}>安全规范</button>
                      </span>
                    </label>

                    {currentError ? (
                      <div className="cf-auth-error">
                        <ShieldAlert size={16} className="cf-auth-error__icon" />
                        <p>{currentError}</p>
                      </div>
                    ) : null}

                    <Button
                      type="submit"
                      disabled={!canSubmit || pendingAction === 'register'}
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

            <div className="cf-auth-mode-footer">
              {isLogin ? (
                <p>还没有账号？ <button type="button" onClick={() => switchMode('register')}>注册</button></p>
              ) : (
                <p>已有账号？ <button type="button" onClick={() => switchMode('login')}>登录</button></p>
              )}
            </div>
            <footer className="cf-auth-copyright">
              <p>© {currentYear} CloudFlow Pro</p>
            </footer>
          </section>
        </main>
      </div>

      {agreementVisible ? (
        <div className="cf-auth-agreement-overlay" role="dialog" aria-modal="true" aria-labelledby="cf-auth-agreement-title">
          <div className="cf-auth-agreement-panel">
            <div className="cf-auth-agreement-head">
              <span className="cf-auth-agreement-icon">
                <ShieldCheck size={21} />
              </span>
              <div>
                <div className="cf-auth-agreement-title-row">
                  <h2 id="cf-auth-agreement-title">{legalRelease?.title || '条款更新通知'}</h2>
                  <span>{legalRelease?.effectiveDate || '待配置'}</span>
                </div>
                <p>
                  {legalLoading
                    ? '正在加载最新条款配置。'
                    : legalError
                      ? legalError
                      : legalRelease?.description || '在继续使用服务之前，请仔细阅读并同意以下条款。'}
                </p>
              </div>
            </div>
            <div className="cf-auth-agreement-body">
              <p>相关文档</p>
              {legalLoading ? (
                <div className="cf-auth-agreement-state">
                  <Loader2 size={16} className="cf-auth-spin" />
                  <span>正在加载条款</span>
                </div>
              ) : legalError ? (
                <div className="cf-auth-agreement-state is-error">
                  <ShieldAlert size={16} />
                  <span>{legalError}</span>
                </div>
              ) : (
                <div className="cf-auth-agreement-doc-grid">
                  {agreementDocuments.map((doc) => (
                    <button
                      key={normalizeDocumentType(doc)}
                      type="button"
                      className="cf-auth-agreement-doc-card"
                      onClick={() => void openLegalDocument(doc)}
                    >
                      <ShieldCheck size={16} />
                      <span>{doc.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="cf-auth-agreement-actions">
              <button type="button" onClick={rejectAgreement}>拒绝</button>
              <button type="button" onClick={acceptAgreement} disabled={legalLoading || Boolean(legalError)}>
                同意并继续
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeLegalDocument || legalDocumentLoading || legalDocumentError ? (
        <div className="cf-auth-agreement-overlay" role="dialog" aria-modal="true" aria-labelledby="cf-auth-document-title">
          <div className="cf-auth-agreement-panel cf-auth-document-panel">
            <div className="cf-auth-agreement-head">
              <span className="cf-auth-agreement-icon">
                <FileText size={21} />
              </span>
              <div>
                <div className="cf-auth-agreement-title-row">
                  <h2 id="cf-auth-document-title">{activeLegalDocument?.title || '条款文档'}</h2>
                  {activeLegalDocument?.version ? <span>{activeLegalDocument.version}</span> : null}
                </div>
                <p>{legalRelease?.title || 'CloudFlow Pro 条款文档'}</p>
              </div>
            </div>
            <div className="cf-auth-agreement-body">
              {legalDocumentLoading ? (
                <div className="cf-auth-agreement-state">
                  <Loader2 size={16} className="cf-auth-spin" />
                  <span>正在加载文档</span>
                </div>
              ) : legalDocumentError ? (
                <div className="cf-auth-agreement-state is-error">
                  <ShieldAlert size={16} />
                  <span>{legalDocumentError}</span>
                </div>
              ) : (
                <>
                  <div className="cf-auth-document-content">
                    {(activeLegalDocument?.content || '文档正文暂未配置')
                      .split('\n')
                      .filter((line) => line.trim().length > 0)
                      .map((line, index) => (
                        <p key={`${activeLegalDocument?.docType || 'doc'}-${index}`}>{line}</p>
                      ))}
                  </div>
                  {activeLegalDocument?.externalUrl ? (
                    <a
                      className="cf-auth-document-link"
                      href={activeLegalDocument.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={15} />
                      打开正式文件
                    </a>
                  ) : null}
                </>
              )}
            </div>
            <div className="cf-auth-agreement-actions cf-auth-document-actions">
              <button
                type="button"
                onClick={() => {
                  setActiveLegalDocument(null);
                  setLegalDocumentError('');
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TotpLoginModal
        open={Boolean(totpChallenge)}
        userEmailMasked={totpChallenge?.userEmailMasked}
        submitting={totpSubmitting}
        onClose={closeTotpLogin}
        onVerify={handleTotpVerify}
      />

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
