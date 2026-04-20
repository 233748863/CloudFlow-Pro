import React from 'react';
import { MonitorCog, MoonStar, SunMedium } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { Button } from './button';
import { cn } from '@/utils/cn';

const themeModeMeta: Record<
  ThemeMode,
  { label: string; Icon: typeof SunMedium }
> = {
  light: { label: '浅色', Icon: SunMedium },
  dark: { label: '深色', Icon: MoonStar },
  system: { label: '跟随系统', Icon: MonitorCog },
};

function getNextThemeMode(themeMode: ThemeMode): ThemeMode {
  if (themeMode === 'light') {
    return 'dark';
  }

  if (themeMode === 'dark') {
    return 'system';
  }

  return 'light';
}

interface ThemeModeSwitcherProps {
  compact?: boolean;
  className?: string;
}

export const ThemeModeSwitcher: React.FC<ThemeModeSwitcherProps> = ({
  compact = false,
  className,
}) => {
  const { themeMode, setThemeMode } = useTheme();
  const { label, Icon } = themeModeMeta[themeMode];
  const nextThemeMode = getNextThemeMode(themeMode);

  return (
    <Button
      type="button"
      variant={compact ? 'ghost' : 'outline'}
      size={compact ? 'icon' : 'default'}
      className={cn(
        compact
          ? 'h-10 w-10 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-300'
          : 'justify-start dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white',
        className,
      )}
      title={`当前主题：${label}，点击切换到${themeModeMeta[nextThemeMode].label}`}
      aria-label={`当前主题：${label}，点击切换到${themeModeMeta[nextThemeMode].label}`}
      onClick={() => setThemeMode(nextThemeMode)}
    >
      <Icon size={18} className="shrink-0" />
      {compact ? null : <span>主题：{label}</span>}
    </Button>
  );
};
