import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { WORKFLOW_CATEGORY_OPTIONS } from "../../utils/workflowCategory";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../common/select";
import { LazyInput, LazyTextarea } from "./LazyInput";
import { ApproverValueSelector } from "./ApproverValueSelector";
import {
  studioSidePanelClassName,
  studioSectionTitleClassName,
} from "./constants";

interface GlobalPropertyPanelProps {
  open: boolean;
  onClose: () => void;
  workflow: {
    formId?: string;
    description?: string;
    category?: string;
    tags?: string;
    startPermissionType?: string;
    startPermissionValue?: string;
  };
  onUpdate: (data: any) => void;
}

export const GlobalPropertyPanel = ({
  open,
  onClose,
  workflow,
  onUpdate,
}: GlobalPropertyPanelProps) => {
  const CATEGORY_NONE_VALUE = "__NONE__";
  const [formData, setFormData] = useState(workflow || {});

  useEffect(() => {
    if (open) {
      setFormData(workflow || {});
    }
  }, [open, workflow]);

  const handleChange = (field: string, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    onUpdate(updated);
  };

  if (!open) return null;

  return (
    <div className={`workflow-studio-panel ${studioSidePanelClassName}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold text-cf-title">
          全局属性
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-1.5 text-cf-faint transition-colors hover:bg-[var(--cf-surface-muted)] hover:text-cf-body dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
        >
          <X size={18} />
        </button>
      </div>
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        <div className="grid gap-3">
          <div className="admin-dialog-field">
            <div className={studioSectionTitleClassName}>基础信息</div>

            <div>
              <span className="mb-1 block text-[11px] font-medium text-cf-subtle">
                流程描述
              </span>
              <LazyTextarea
                className="min-h-[88px]"
                placeholder="请输入流程描述"
                value={formData.description || ""}
                onChange={(val: string) => handleChange("description", val)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <span className="mb-1 block text-[11px] font-medium text-cf-subtle">
                  流程分类
                </span>
                <Select
                  value={formData.category || CATEGORY_NONE_VALUE}
                  onValueChange={(v) =>
                    handleChange("category", v === CATEGORY_NONE_VALUE ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CATEGORY_NONE_VALUE}>未分类</SelectItem>
                    {WORKFLOW_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-medium text-cf-subtle">
                  关联表单
                </span>
                <LazyInput
                  placeholder="form_leave_01"
                  value={formData.formId || ""}
                  onChange={(val: string) => handleChange("formId", val)}
                />
              </div>
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-medium text-cf-subtle">
                流程标签
              </span>
              <LazyInput
                placeholder="多个标签用逗号分隔"
                value={formData.tags || ""}
                onChange={(val: string) => handleChange("tags", val)}
              />
            </div>
          </div>

          <div className="admin-dialog-field border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className={studioSectionTitleClassName}>发起权限</div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-cf-subtle">
                谁可以发起此流程
              </span>
              <Select
                value={formData.startPermissionType || "ALL"}
                onValueChange={(v) => {
                  handleChange("startPermissionType", v);
                  if (v === "ALL") handleChange("startPermissionValue", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有人</SelectItem>
                  <SelectItem value="ROLE">指定角色</SelectItem>
                  <SelectItem value="USER">指定人员</SelectItem>
                  <SelectItem value="DEPT">指定部门</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {["ROLE", "USER", "DEPT"].includes(
              formData.startPermissionType || "",
            ) && (
              <ApproverValueSelector
                type={formData.startPermissionType as string}
                value={formData.startPermissionValue || ""}
                onChange={(val) => handleChange("startPermissionValue", val)}
                multiple={true}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
