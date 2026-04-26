import React from 'react';
import { cn } from '@/utils/cn';

type LoadingSpinnerSize = 'sm' | 'md' | 'lg' | 'xl';
type LoadingSpinnerColor = 'primary' | 'secondary' | 'white' | 'gray';

interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  color?: LoadingSpinnerColor;
  className?: string;
}

const sizeClassMap: Record<LoadingSpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12 border-[3px]',
  xl: 'h-16 w-16 border-4',
};

const colorClassMap: Record<LoadingSpinnerColor, string> = {
  primary: 'text-cyan-500 dark:text-cyan-300',
  secondary: 'text-slate-500 dark:text-slate-400',
  white: 'text-white',
  gray: 'text-slate-400 dark:text-slate-500',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className,
}) => (
  <div
    className={cn('spinner', sizeClassMap[size], colorClassMap[color], className)}
    role="status"
    aria-label="loading"
  />
);
