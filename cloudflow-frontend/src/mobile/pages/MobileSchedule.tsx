import React from 'react';
import { SchedulePage } from '@/pages/SchedulePage';

// 手机复用正式日程表单、冲突确认、版本校验和取消原因，避免入口跳向不存在的路由。
export const MobileSchedule: React.FC = () => <SchedulePage mobile />;
