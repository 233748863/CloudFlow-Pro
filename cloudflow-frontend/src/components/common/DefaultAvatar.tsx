import React from 'react';
import { cn } from '@/utils/cn';
import '../../styles/features/default-avatar.css';

export type DefaultAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface DefaultAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  size?: DefaultAvatarSize;
}

const AVATAR_COLORS = [
  '#0b7894',
  '#9a4f14',
  '#6254b5',
  '#9a6a08',
  '#9b4169',
  '#26734d',
  '#2f6fa8',
  '#a33f42',
] as const;

const stableLabelHash = (label: string) => {
  let hash = 2166136261;
  for (const character of Array.from(label)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getDefaultAvatarColor = (label?: string) => {
  const normalized = String(label || '?').trim() || '?';
  return AVATAR_COLORS[stableLabelHash(normalized) % AVATAR_COLORS.length];
};

export const DefaultAvatar = React.forwardRef<HTMLDivElement, DefaultAvatarProps>(
  ({ label = '', size = 'md', className, style, ...props }, ref) => {
    const normalized = label.trim();
    const initial = (Array.from(normalized)[0] || '?').toLocaleUpperCase('zh-CN');
    const avatarStyle = {
      '--cf-default-avatar-bg': getDefaultAvatarColor(normalized),
      ...style,
    } as React.CSSProperties;

    return (
      <div
        ref={ref}
        role="img"
        aria-label={normalized ? `${normalized}的头像` : '默认头像'}
        className={cn('default-avatar', `default-avatar--${size}`, className)}
        style={avatarStyle}
        {...props}
      >
        <span className="default-avatar-glow" aria-hidden="true" />
        <span className="default-avatar-ring" aria-hidden="true" />
        <span className="default-avatar-initials">{initial}</span>
      </div>
    );
  },
);

DefaultAvatar.displayName = 'DefaultAvatar';

