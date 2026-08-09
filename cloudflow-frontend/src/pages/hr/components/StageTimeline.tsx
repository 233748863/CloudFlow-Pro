import React from 'react';
import { useDict } from '@/hooks/useDict';

export type StageTimelineTone = 'emerald' | 'sky';

const toneClass: Record<StageTimelineTone, { dot: string; line: string }> = {
  emerald: { dot: 'bg-emerald-500 text-white', line: 'bg-emerald-500' },
  sky: { dot: 'bg-sky-500 text-white', line: 'bg-sky-500' },
};

interface StageTimelineProps {
  steps: string[];
  labels?: Record<string, string>;
  dictType?: string;
  current?: string;
  tone?: StageTimelineTone;
}

export const StageTimeline: React.FC<StageTimelineProps> = ({ steps, labels, dictType, current, tone = 'emerald' }) => {
  const { getLabel } = useDict(dictType ?? '', { enabled: !!dictType });
  const currentIdx = steps.indexOf(String(current ?? '').toUpperCase());
  const cls = toneClass[tone];
  const resolveLabel = (s: string) => labels?.[s] ?? (dictType ? getLabel(s) : s);
  return (
    <div className="flex flex-wrap items-center gap-1 py-1">
      {steps.map((s, idx) => {
        const reached = currentIdx >= idx;
        return (
          <React.Fragment key={s}>
            <div className={`rounded-md px-2 py-0.5 text-[10px] ${reached ? cls.dot : 'bg-[var(--cf-surface-muted)] text-cf-faint'}`}>
              {resolveLabel(s)}
            </div>
            {idx < steps.length - 1 && (
              <div className={`h-px w-3 ${currentIdx > idx ? cls.line : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default StageTimeline;
