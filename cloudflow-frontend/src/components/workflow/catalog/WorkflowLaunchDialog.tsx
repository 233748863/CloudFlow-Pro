import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseDialog } from '@/components/common';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
import { FormRenderer } from '@/components/FormRenderer';
import type { FormDefinition, WorkflowDefinition } from '@/types';

interface WorkflowLaunchDialogProps {
  open: boolean;
  workflow: WorkflowDefinition | null;
  boundForm?: FormDefinition;
  loadingBoundForm: boolean;
  boundFormError?: string | null;
  onClose: () => void;
  onSubmit: (data: Record<string, any>) => void;
}

export const WorkflowLaunchDialog: React.FC<WorkflowLaunchDialogProps> = ({
  open,
  workflow,
  boundForm,
  loadingBoundForm,
  boundFormError,
  onClose,
  onSubmit,
}) => {
  if (!open || !workflow) {
    return null;
  }

  if (workflow.formId && boundForm) {
    return <FormRenderer formDef={boundForm} onCancel={onClose} onSubmit={onSubmit} />;
  }

  if (workflow.formId && loadingBoundForm) {
    return (
      <BaseDialog
        open={open}
        title="正在准备发起表单"
        description={`正在加载“${workflow.name}”绑定的表单定义。`}
        onClose={onClose}
        maxWidthClassName="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
          </div>
        }
      >
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner size="lg" />
        </div>
      </BaseDialog>
    );
  }

  if (workflow.formId && !boundForm) {
    return (
      <BaseDialog
        open={open}
        title="绑定表单不可用"
        description={`流程“${workflow.name}”当前无法加载绑定表单。`}
        onClose={onClose}
        maxWidthClassName="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
          </div>
        }
      >
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-amber-500" />}
          title="绑定表单不存在"
          description={
            boundFormError
              ? `无法加载绑定表单：${boundFormError}`
              : '流程绑定的表单可能已被删除，或当前账号暂无访问权限，请联系管理员检查流程配置。'
          }
          className="py-6"
        />
      </BaseDialog>
    );
  }

  return (
    <BaseDialog
      open={open}
      title="暂未配置输入表单"
      description={`流程“${workflow.name}”还没有绑定可发起表单。`}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10 text-amber-500" />}
        title="未绑定表单"
        description="该流程尚未配置输入表单，当前无法直接发起。"
        className="py-6"
      />
    </BaseDialog>
  );
};
