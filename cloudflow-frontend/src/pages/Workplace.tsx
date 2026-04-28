import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Contact,
  FileClock,
  Megaphone,
  Timer,
  UserRound,
} from 'lucide-react';

const entries = [
  {
    title: '休假登记',
    description: '按上午、下午或全天登记休假。',
    path: '/hr/leave/application',
    icon: FileClock,
  },
  {
    title: '加班登记',
    description: '按命中的半天班段生成调休额度。',
    path: '/hr/overtime/applications',
    icon: Timer,
  },
  {
    title: '假期额度',
    description: '查看和维护年假、调休等额度。',
    path: '/hr/leave/quota',
    icon: CalendarDays,
  },
  {
    title: '员工档案',
    description: '维护员工基本资料和紧急联系人。',
    path: '/hr/employees',
    icon: UserRound,
  },
  {
    title: '公告中心',
    description: '发布和查看组织公告。',
    path: '/announcement',
    icon: Megaphone,
  },
  {
    title: '通讯录',
    description: '查询员工和部门联系方式。',
    path: '/office/contact',
    icon: Contact,
  },
];

export const Workplace = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">工作台</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          日常登记、公告、通讯录和员工档案。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <button
            key={entry.path}
            type="button"
            onClick={() => navigate(entry.path)}
            className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/20"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
                <entry.icon size={20} />
              </span>
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {entry.title}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {entry.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Workplace;
