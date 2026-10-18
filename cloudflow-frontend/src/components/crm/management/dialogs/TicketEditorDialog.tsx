import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { BaseDialog, Button } from '@/components/common';
import { useCrmManagement } from '../store';
import { TicketDialogContent } from './TicketDialogContent';
import '@/pages/portal/portal.css';

export function TicketEditorDialog() {
  const { ticketForm, ticketReady, saving, openDialog, saveDialog } = useCrmManagement();
  const [baseline, setBaseline] = useState<string>();
  const [discard, setDiscard] = useState(false);
  useEffect(() => { if (ticketReady && baseline === undefined) setBaseline(JSON.stringify(ticketForm)); }, [ticketReady, ticketForm, baseline]);
  const dirty = baseline !== undefined && baseline !== JSON.stringify(ticketForm);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || saving)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, saving]);
  useEffect(() => { if (saving && blocker.state === 'blocked') blocker.reset(); }, [saving, blocker]);
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else openDialog(null); } };
  return <><BaseDialog open title={ticketForm.ticketId ? '编辑工单' : '新增工单'} width="wide" panelClassName="portal-controls" onClose={close} hideCloseButton={saving} closeOnEscape={!saving && !discard}
    footer={<><Button variant="outline" disabled={saving} onClick={close}>取消</Button><Button disabled={saving || !ticketReady || ticketForm.portalContactId != null && ticketForm.ownerId == null} onClick={() => void saveDialog()}>{saving ? '保存中…' : '保存'}</Button></>}><TicketDialogContent /></BaseDialog>
    <BaseDialog open={!saving && (discard || blocker.state === 'blocked')} title="舍弃未保存的工单修改？" panelClassName="portal-controls" zIndex={60}
      onClose={() => { setDiscard(false); if (blocker.state === 'blocked') blocker.reset(); }} footerClassName="flex-wrap"
      footer={<><Button variant="outline" onClick={() => { setDiscard(false); if (blocker.state === 'blocked') blocker.reset(); }}>继续编辑</Button><Button onClick={() => { if (blocker.state === 'blocked') blocker.proceed(); else openDialog(null); }}>舍弃修改并离开</Button></>}>
      <p className="text-sm leading-6">未保存输入将丢失。连接中断后请先读取最新工单，离开不会撤销服务器已保存的结果。</p>
    </BaseDialog></>;
}
