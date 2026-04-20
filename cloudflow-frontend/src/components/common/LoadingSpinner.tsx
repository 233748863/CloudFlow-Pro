import React from 'react';
import { cn } from '@/utils/cn';

type LoadingSpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  className?: string;
}

const sizeClassMap: Record<LoadingSpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
}) => (
  <div
    className={cn('spinner text-cyan-500 dark:text-cyan-300', sizeClassMap[size], className)}
    aria-hidden="true"
  />
);
