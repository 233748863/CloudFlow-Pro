import React from 'react';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { HEALTH_TONE, healthLabelMap, invoiceStatusLabelMap, severityLabelMap, stageLabelMap, statusLabelMap } from './constants';

export const formatDashboardNumber = (value?: number) => Number(value || 0).toLocaleString('zh-CN');
export const formatDashboardCurrency = (value?: number) => `¥${formatDashboardNumber(value)}`;
export const formatDashboardDate = (value?: string) => {
  const formatted = formatDateTimeDisplay(value);
  return formatted === '-' ? '未设置' : formatted.slice(0, 10);
};

export const renderHealthBadge = (level?: string) => (
  <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${HEALTH_TONE[level || 'GREEN'] || HEALTH_TONE.GREEN}`}>
    {healthLabelMap[level || 'GREEN'] || level || '健康'}
  </span>
);

export const renderStatus = (status?: string) => statusLabelMap[status || ''] || stageLabelMap[status || ''] || status || '-';
export const renderInvoiceStatus = (status?: string) => invoiceStatusLabelMap[status || ''] || status || '-';
export const renderSeverity = (severity?: string) => severityLabelMap[severity || ''] || severity || '-';
export const renderHealthLabel = (level?: string) => healthLabelMap[level || ''] || level || '-';
