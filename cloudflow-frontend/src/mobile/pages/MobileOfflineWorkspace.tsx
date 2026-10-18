import React, { useState } from 'react';
import { readLastMobileSnapshots } from '@/utils/mobileSnapshots';

// 独立于 AuthContext/业务路由，仅展示已保存摘要，离线不恢复登录身份。
export default function MobileOfflineWorkspace({ onRetry, onLogout }: { onRetry: () => void; onLogout: () => void }) {
  const [page, setPage] = useState<'dashboard' | 'todo'>(window.location.pathname === '/tasks' ? 'todo' : 'dashboard');
  const saved = readLastMobileSnapshots();
  const snapshot = page === 'todo' ? saved?.todo : saved?.dashboard;
  return <main className="mx-auto min-h-screen max-w-2xl space-y-4 bg-[var(--cf-bg)] p-4 text-cf-title">
    <h1 className="text-xl font-semibold">离线只读工作区</h1>
    <p role="status" className="text-sm text-cf-subtle">显示本标签页上次登录时查看的摘要，有效期24小时；连接网络并验证身份后可处理业务。</p>
    <nav aria-label="离线页面" className="flex gap-3">
      <button className="min-h-11 rounded border px-4" aria-pressed={page === 'dashboard'} onClick={() => setPage('dashboard')}>工作台</button>
      <button className="min-h-11 rounded border px-4" aria-pressed={page === 'todo'} onClick={() => setPage('todo')}>待办</button>
    </nav>
    {snapshot ? <p className="text-sm text-cf-subtle">保存于 {new Date(snapshot.savedAt).toLocaleString()}</p> : <p>此页面尚无可用离线摘要，请联网后查看。</p>}
    {page === 'dashboard' && saved?.dashboard && <>
      <p>待办 {saved.dashboard.data.stats.pendingTasks} · 日程 {saved.dashboard.data.stats.todaySchedules} · 未读 {saved.dashboard.data.stats.unreadMessages}</p>
      <h2 className="font-semibold">最近任务</h2>
      {saved.dashboard.data.tasks.map(task => <article key={task.taskId} className="rounded-lg border p-3"><p>{task.taskName}</p><p className="text-sm text-cf-subtle">{task.processName} · {task.applicant}</p></article>)}
      <h2 className="font-semibold">已保存日程</h2>
      {saved.dashboard.data.schedules.map(event => <article key={event.eventId} className="rounded-lg border p-3"><p>{event.title}</p><p className="text-sm text-cf-subtle">{event.startTime.replace('T', ' ')}</p></article>)}
    </>}
    {page === 'todo' && saved?.todo && <>
      <p>待办共 {saved.todo.data.total} 条，已保存最近 {saved.todo.data.tasks.length} 条。</p>
      {saved.todo.data.tasks.map(task => <article key={task.id} className="rounded-lg border p-3"><p>{task.taskName}</p><p className="text-sm text-cf-subtle">{task.processName} · {task.applicantName}</p>{task.dueDate && <p className="text-sm">截止 {task.dueDate}</p>}</article>)}
    </>}
    <div className="flex gap-3"><button className="min-h-11 rounded border px-4" onClick={onRetry}>重新验证</button>
      <button className="min-h-11 rounded border px-4" onClick={onLogout}>退出并清除摘要</button></div>
  </main>;
}
