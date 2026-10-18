import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { ImportDialog } from './ImportDialog';

export function ImportButton({ bizType, permission, onSuccess, disabled = false }: {
  bizType: string;
  permission: string;
  onSuccess?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const refreshPending = useRef(false);
  const { hasPermission } = useAuth();
  if (!hasPermission(['system:import:list', 'system:import:execute', permission], true)) return null;
  const close = () => {
    setOpen(false);
    // Parent refreshes can replace the page subtree; retain the result until close.
    if (refreshPending.current) {
      refreshPending.current = false;
      onSuccess?.();
    }
  };
  return <>
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}><Upload size={16} />批量导入</Button>
    <ImportDialog open={open} bizType={bizType} onClose={close} onSuccess={() => { refreshPending.current = true; }} />
  </>;
}
