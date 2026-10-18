import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Home, ListTodo, MessageSquare, User } from 'lucide-react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/common/table';
import { TableScrollArea } from '@/components/common/TableScrollArea';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Dialog, DialogContent, DialogTitle } from '@/components/common/dialog';
import { SelectorShell } from '@/components/common/SelectorShell';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { Pagination } from '@/components/common/Pagination';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/common/tabs';
import { SideNavDrawer } from '@/components/common/side-nav';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';
import { MobileFilterDrawer } from '@/components/mobile/MobileFilterDrawer';
import { MobileActionSheet } from '@/components/mobile/MobileActionSheet';
import { MobileListCard } from '@/components/mobile/MobileListCard';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const choices = [{ id: 'first', label: '张三', subLabel: '研发部' }, { id: 'second', label: '李四', subLabel: '运营部' }, { id: 'disabled', label: '停用人员', disabled: true }];

const FoundationCheck = () => {
  const breakpoint = useBreakpoint();
  const tableRef = useRef<HTMLTableElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState(false);
  const [primitive, setPrimitive] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [filter, setFilter] = useState(false);
  const [actions, setActions] = useState(false);
  const [actionCount, setActionCount] = useState(0);
  const [rowCount, setRowCount] = useState(0);
  const [refTag, setRefTag] = useState('');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const selector = (placeholder: string) => <SelectorShell placeholder={placeholder} options={choices} value={selected} onToggle={(value) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} onRemove={(value) => setSelected((current) => current.filter((item) => item !== value))} />;

  return (
    <MemoryRouter>
      <MobileHeader title="公共组件验收" onBack={() => setRefTag('返回')} actions={<button type="button" className="cf-mobile-icon-button" aria-label="导航" onClick={() => setDrawer(true)}>菜单</button>} />
      <main className="mx-auto max-w-5xl space-y-4 p-4 pb-24">
        <output id="breakpoint">{breakpoint}</output>
        <output id="row-count">{rowCount}</output><output id="ref-tag">{refTag}</output><output id="action-count">{actionCount}</output><output id="selected">{selected.join(',')}</output>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="cf-mobile-touch" onClick={() => setRefTag(tableRef.current?.tagName || '')}>检查引用</button>
          <button type="button" className="cf-mobile-touch" onClick={() => setDialog(true)}>打开基础弹窗</button>
          <button type="button" className="cf-mobile-touch" onClick={() => setPrimitive(true)}>打开基础对话框</button>
          <button type="button" className="cf-mobile-touch" onClick={() => setFilter(true)}>打开筛选</button>
          <button type="button" className="cf-mobile-touch" onClick={() => setActions(true)}>打开操作面板</button>
        </div>
        <TableScrollArea maxHeight={240}>
          <Table ref={tableRef} stickyHeader pinnedColumns={{ left: 1, right: 1 }}>
            <TableHeader><TableRow><TableHead><button type="button" onClick={() => setRowCount((count) => count + 1)}>全选</button></TableHead><TableHead>姓名</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {choices.slice(0, 2).map((choice) => <TableRow key={choice.id}><TableCell><input type="checkbox" aria-label={`选择${choice.label}`} /></TableCell><TableCell>{choice.label}</TableCell><TableCell>处理中</TableCell><TableCell><button type="button" onClick={() => setRowCount((count) => count + 1)}>处理{choice.label}</button></TableCell></TableRow>)}
              <TableRow><TableCell colSpan={4}>跨列提示</TableCell></TableRow>
            </TableBody>
          </Table>
        </TableScrollArea>
        <Pagination total={21} page={page} pageSize={10} onPageChange={setPage} onPageSizeChange={() => {}} />
        {selector('选择人员')}
        <DateRangePicker value={range} onChange={setRange} min="2026-01-01" max="2026-12-31" />
        <output id="range">{range.startDate}/{range.endDate}</output>
        <Tabs defaultValue="first"><TabsList>{['first', 'second', 'third', 'fourth', 'fifth'].map((value, index) => <TabsTrigger key={value} value={value}>较长标签名称 {index + 1}</TabsTrigger>)}</TabsList><TabsContent value="first">第一个面板</TabsContent><TabsContent value="second">第二个面板</TabsContent></Tabs>
        <MobileListCard heading="独立卡片" description="复用主题变量" footer={<button type="button">卡片操作</button>}><p>列表内容</p></MobileListCard>
        <BaseDialog open={dialog} title="基础弹窗" onClose={() => setDialog(false)} footer={<button type="button" onClick={() => setDialog(false)}>保存并关闭</button>}>
          <input aria-label="弹窗输入" data-autofocus className="cf-control" />
          {selector('弹窗内人员')}
        </BaseDialog>
        <Dialog open={primitive} onOpenChange={setPrimitive}><DialogContent><DialogTitle>基础对话框</DialogTitle><p>对话框正文</p></DialogContent></Dialog>
        <SideNavDrawer open={drawer} onClose={() => setDrawer(false)}><aside className="sidebar cf-app-sidebar cf-mobile-sidebar-open"><div className="sidebar-header">导航验收</div><button type="button" className="sidebar-link" onClick={() => setDrawer(false)}>进入工作台</button></aside></SideNavDrawer>
        <MobileFilterDrawer open={filter} onClose={() => setFilter(false)} onApply={() => { setRefTag('筛选已应用'); setFilter(false); }} onReset={() => setRefTag('筛选已重置')}><label>关键字<input aria-label="筛选关键字" className="cf-control" /></label></MobileFilterDrawer>
        <MobileActionSheet open={actions} onClose={() => setActions(false)} actions={[{ key: 'execute', label: '异步执行', onSelect: async () => { await new Promise((resolve) => setTimeout(resolve, 120)); setActionCount((count) => count + 1); } }]} />
      </main>
      {breakpoint === 'mobile' ? <MobileTabBar items={[{ key: 'home', label: '工作台', path: '/', icon: Home }, { key: 'todo', label: '待办', path: '/tasks', icon: ListTodo, badge: 7 }, { key: 'messages', label: '消息', path: '/messages', icon: MessageSquare, badge: 120 }, { key: 'profile', label: '我的', path: '/profile', icon: User }]} /> : null}
    </MemoryRouter>
  );
};

createRoot(document.getElementById('root')!).render(<FoundationCheck />);
