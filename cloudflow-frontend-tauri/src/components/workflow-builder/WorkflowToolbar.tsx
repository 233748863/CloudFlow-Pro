import { Undo2, Redo2 } from "lucide-react";
import { Input } from "../common/input";
import { Button } from "../common/button";

interface WorkflowToolbarProps {
  workflowName: string;
  workflowKey: string;
  workflowId?: string;
  onNameChange: (name: string) => void;
  onKeyChange: (key: string) => void;
  onSave: () => void;
  onDeploy: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenGlobalConfig: () => void;
  onOpenSettings: () => void;
  onViewVersionHistory?: () => void;
  onExport?: () => void;
  onSimulate?: () => void;
  saving: boolean;
}

export const WorkflowToolbar = ({
  workflowName,
  workflowKey,
  workflowId,
  onNameChange,
  onKeyChange,
  onSave,
  onDeploy,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenGlobalConfig,
  onOpenSettings,
  onViewVersionHistory,
  onExport,
  onSimulate,
  saving,
}: WorkflowToolbarProps) => {
  return (
    <div className="workflow-studio-toolbar relative z-20 flex min-h-[56px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Input
            className="h-8 w-48 max-w-full rounded-md border-slate-200 bg-white px-3 text-sm font-medium shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            value={workflowName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="流程名称"
          />
          <Input
            className="h-8 w-36 max-w-full rounded-md border-slate-200 bg-white px-3 font-mono text-[11px] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            value={workflowKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="流程 Key"
          />
        </div>
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="shrink-0 whitespace-nowrap"
        >
          流程设置
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGlobalConfig}
          className="shrink-0 whitespace-nowrap"
        >
          全局属性
        </Button>
        {workflowId &&
          !workflowId.startsWith("new_") &&
          onViewVersionHistory && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewVersionHistory}
              className="shrink-0 whitespace-nowrap"
              title="查看版本历史"
            >
              版本历史
            </Button>
          )}
        {workflowId && !workflowId.startsWith("new_") && onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="shrink-0 whitespace-nowrap"
            title="导出流程"
          >
            导出
          </Button>
        )}
        {workflowId && !workflowId.startsWith("new_") && onSimulate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSimulate}
            className="shrink-0 whitespace-nowrap"
            title="模拟测试流程"
          >
            模拟测试
          </Button>
        )}
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
          <Button
            variant="ghost"
            size="icon"
            onClick={onUndo}
            disabled={!canUndo}
            className={`h-7 w-7 rounded-md p-0 ${!canUndo ? "cursor-not-allowed text-slate-300 dark:text-slate-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRedo}
            disabled={!canRedo}
            className={`h-7 w-7 rounded-md p-0 ${!canRedo ? "cursor-not-allowed text-slate-300 dark:text-slate-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 gap-1.5 whitespace-nowrap"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-transparent dark:border-slate-200 dark:border-t-transparent"></div>
          ) : null}
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button
          size="sm"
          onClick={onDeploy}
          disabled={saving}
          className="shrink-0 gap-1.5 whitespace-nowrap"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : null}
          {saving ? "发布中..." : "发布"}
        </Button>
      </div>
    </div>
  );
};
