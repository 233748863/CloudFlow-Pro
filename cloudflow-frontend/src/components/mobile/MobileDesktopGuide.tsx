import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import { Button } from '@/components/common/button';
import { EmptyState } from '@/components/common/EmptyState';
import { findMobileDesktopPage, type MobileDesktopPage } from '@/config/mobileDesktopPages';
import { isMobileDevice } from '@/utils/device';

interface MobileDesktopGuideProps {
  children: ReactNode;
  page?: MobileDesktopPage;
  onContinue?: () => void;
}

// 布局：[电脑图标] → 建议与功能名称 → [返回工作台] [仍要继续]；沿用现有空状态及主题。
function GuideContent({ children, page, onContinue }: MobileDesktopGuideProps & { page: MobileDesktopPage }) {
  const navigate = useNavigate();
  const [continued, setContinued] = useState(false);
  if (continued) return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={`${page.title}桌面版，可横向滚动`}>
      <div className="min-w-[1024px]">{children}</div>
    </div>
  );
  return <EmptyState
    icon={<Monitor className="empty-state-icon" aria-hidden="true" />}
    title="此功能建议在电脑端使用"
    description={`${page.title}需要较宽的操作区域，继续后可横向滚动查看桌面版。`}
    className="px-4"
    action={<div className="flex flex-wrap justify-center gap-3">
      <Button type="button" className="min-h-11 min-w-11" onClick={() => navigate('/')}>返回工作台</Button>
      <Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={() => { setContinued(true); onContinue?.(); }}>仍要继续</Button>
    </div>}
  />;
}

export function MobileDesktopGuide({ children, page, onContinue }: MobileDesktopGuideProps) {
  const location = useLocation();
  const [mobileDevice] = useState(isMobileDevice);
  const desktopPage = page ?? findMobileDesktopPage(location.pathname);
  if (!mobileDevice || !desktopPage) return <>{children}</>;
  return <GuideContent key={`${location.key}:${desktopPage.path}`} page={desktopPage} onContinue={onContinue}>{children}</GuideContent>;
}
