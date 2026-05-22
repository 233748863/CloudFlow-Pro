import { useState, useEffect, useMemo } from "react";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { NodeType, WorkflowGraphNode } from "../../types";

/**
 * P2-3: 最小化 condition 表达式校验。
 *  - 空字符串：合法（落到默认分支语义）；
 *  - 括号必须成对；
 *  - 禁止反引号 / 分号 / 大括号等典型 JS 注入字符；
 *  - 必须至少含一个比较或逻辑运算符（>、<、=、!、&、|）。
 *
 * 这是设计期的"早失败"，不替代后端最终语法校验。
 */
const validateConditionExpression = (
  raw: string,
): { valid: boolean; error?: string } => {
  const expr = (raw ?? "").trim();
  if (!expr) return { valid: true };

  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return { valid: false, error: "括号不匹配：多余的右括号" };
    }
  }
  if (depth > 0) return { valid: false, error: "括号不匹配：缺少右括号" };

  if (/[`;{}]/.test(expr)) {
    return { valid: false, error: "包含非法字符（如反引号、分号、花括号）" };
  }
  if (!/[=<>!&|]/.test(expr)) {
    return {
      valid: false,
      error: "缺少比较 / 逻辑运算符（>, <, ==, !=, &&, || 等）",
    };
  }
  return { valid: true };
};
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../common/select";
import { DatePicker } from "../common/date-picker";
import { ApproverValueSelector } from "./ApproverValueSelector";
import { LazyInput, LazyTextarea } from "./LazyInput";
import {
  APPROVER_TYPE_LABELS,
  BRANCH_STRATEGY_LABELS,
  NODE_TYPE_LABELS,
  studioSectionTitleClassName,
  studioSidePanelClassName,
  studioSubtleBlockClassName,
} from "./constants";
import type { EditableWorkflowNode } from "./types";

interface PropertyPanelProps {
  node: EditableWorkflowNode;
  branchCount: number;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<WorkflowGraphNode>) => void;
  onDelete: (id: string) => void;
  onConfirmAction: (message: string, onConfirm: () => void) => void;
}

export const PropertyPanel = ({
  node,
  branchCount,
  onClose,
  onUpdate,
  onDelete,
}: PropertyPanelProps) => {
  const [formData, setFormData] = useState(node);
  // 当节点 ID 变化或节点内容（分支、props）变化时同步 formData
  useEffect(() => {
    setFormData(node);
  }, [node.id, branchCount, node.branchStrategy, node.props]);

  // P2-1: Esc 关闭属性面板，与右上角 X 按钮等价。
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active && "isContentEditable" in active && active.isContentEditable)
      ) {
        // 输入态先让浏览器处理 blur，再触发关闭由用户重按
        (active as HTMLElement).blur?.();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // P2-3: 条件表达式即时校验，结果用于输入框红框与下方错误提示。
  const conditionValidation = useMemo(
    () => validateConditionExpression(String(formData.condition || "")),
    [formData.condition],
  );

  const handleChange = (field: keyof EditableWorkflowNode, value: any) => {
    // 切换审批方式时，清空之前选择的审批人，避免残留旧数据
    if (field === "approverType") {
      const updated = { ...formData, approverType: value, approverValue: "" };
      setFormData(updated);
      onUpdate(node.id, { approverType: value, approverValue: "" });
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
    onUpdate(node.id, { [field]: value });
  };

  const branchStrategyOptions =
    node.type === NodeType.PARALLEL
      ? (Object.entries(BRANCH_STRATEGY_LABELS).filter(([key]) =>
          ["PARALLEL", "RACE"].includes(key),
        ) as Array<[string, string]>)
      : (Object.entries(BRANCH_STRATEGY_LABELS).filter(
          ([key]) => key === "EXCLUSIVE",
        ) as Array<[string, string]>);
  const branchStrategyValues = branchStrategyOptions.map(([key]) => key);
  const normalizedBranchStrategy = branchStrategyValues.includes(
    String(formData.branchStrategy || ""),
  )
    ? String(formData.branchStrategy)
    : node.type === NodeType.PARALLEL
      ? "PARALLEL"
      : "EXCLUSIVE";

  return (
    <div className={`workflow-studio-panel ${studioSidePanelClassName}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          节点设置
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
        >
          <X size={18} />
        </button>
      </div>
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {NODE_TYPE_LABELS[node.type] || node.type}
          </span>
          {node.type !== NodeType.START && node.type !== NodeType.END && (
            <button
              onClick={() => onDelete(node.id)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-rose-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-200"
              title="删除节点"
            >
              <Trash2 size={14} /> 删除节点
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-2.5">
            <div className={studioSectionTitleClassName}>基础信息</div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                名称
              </span>
              <LazyInput
                value={formData.title}
                onChange={(val: any) => handleChange("title", val)}
                placeholder="请输入节点名称"
              />
            </div>
          </div>
          {node.type === NodeType.APPROVAL && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>审批人设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  审批方式
                </span>
                <Select
                  value={formData.approverType || "ROLE"}
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPROVER_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.approverType === "ROLE" && (
                <ApproverValueSelector
                  type="ROLE"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USER" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USERS" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
              {formData.approverType === "DEPT" && (
                <ApproverValueSelector
                  type="DEPT"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
            </div>
          )}
          {node.type === NodeType.PARALLEL && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>会签设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  会签类型
                </span>
                <Select
                  value={formData.signType || "ALL"}
                  onValueChange={(v) => handleChange("signType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全签（所有人同意）</SelectItem>
                    <SelectItem value="ANY">或签（任一人同意）</SelectItem>
                    <SelectItem value="PERCENT">比例签（按比例通过）</SelectItem>
                    <SelectItem value="SEQUENTIAL">
                      顺序签（按顺序逐个审批）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.signType === "PERCENT" && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    通过比例 (%)
                  </span>
                  <LazyInput
                    type="number"
                    min={1}
                    max={100}
                    placeholder="例如: 60"
                    value={formData.passPercent || ""}
                    onChange={(val: any) =>
                      handleChange("passPercent", parseInt(val) || 0)
                    }
                  />
                </div>
              )}
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  审批方式
                </span>
                <Select
                  value={
                    formData.approverType === "USERS"
                      ? "USER"
                      : formData.approverType || "ROLE"
                  }
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPROVER_TYPE_LABELS)
                      .filter(([k]) => k !== "USERS")
                      .map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {(formData.approverType === "ROLE" ||
                formData.approverType === "USER" ||
                formData.approverType === "USERS") && (
                <ApproverValueSelector
                  type={
                    formData.approverType === "USERS"
                      ? "USER"
                      : formData.approverType || "ROLE"
                  }
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
            </div>
          )}
          {(node.type === NodeType.APPROVAL ||
            node.type === NodeType.MANUAL) && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>表单权限</div>
              <div className="flex items-center justify-between gap-3 border border-slate-200 px-3 py-2 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  允许编辑表单
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-700 focus:ring-slate-400 dark:text-slate-200 dark:focus:ring-slate-600"
                  checked={formData.allowEdit || false}
                  onChange={(e) => handleChange("allowEdit", e.target.checked)}
                />
              </div>
            </div>
          )}
          {(node.type === NodeType.APPROVAL ||
            node.type === NodeType.MANUAL) && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>SLA 超时设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  超时时间（小时）
                </span>
                <LazyInput
                  type="number"
                  placeholder="例如: 24"
                  value={formData.slaHours || ""}
                  onChange={(val: any) =>
                    handleChange("slaHours", val ? parseInt(val) : undefined)
                  }
                />
              </div>
              {formData.slaHours && formData.slaHours > 0 && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    超时动作
                  </span>
                  <Select
                    value={formData.slaAction || "AUTO_PASS"}
                    onValueChange={(v) => handleChange("slaAction", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO_PASS">自动通过</SelectItem>
                      <SelectItem value="AUTO_REJECT">自动拒绝</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.NOTIFICATION && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>通知设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  接收人类型
                </span>
                <Select
                  value={formData.props?.recipientType || "INITIATOR"}
                  onValueChange={(v) =>
                    handleChange("props", {
                      ...formData.props,
                      recipientType: v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INITIATOR">发起人</SelectItem>
                    <SelectItem value="ROLE">按角色</SelectItem>
                    <SelectItem value="USER">指定人员</SelectItem>
                    <SelectItem value="DEPT">按部门</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.props?.recipientType === "ROLE" ||
                formData.props?.recipientType === "USER" ||
                formData.props?.recipientType === "DEPT") && (
                <ApproverValueSelector
                  type={formData.props?.recipientType || "ROLE"}
                  value={formData.props?.recipientValue || ""}
                  onChange={(val) =>
                    handleChange("props", {
                      ...formData.props,
                      recipientValue: val,
                    })
                  }
                />
              )}
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  通知标题
                </span>
                <LazyInput
                  placeholder="例如: 您有新的审批任务"
                  value={formData.props?.notificationTitle || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      notificationTitle: val,
                    })
                  }
                />
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  通知内容
                </span>
                <LazyTextarea
                  className="min-h-[88px]"
                  placeholder="支持变量: ${initiator}, ${amount}, ${days} 等"
                  value={formData.props?.notificationContent || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      notificationContent: val,
                    })
                  }
                />
              </div>
            </div>
          )}
          {node.type === NodeType.SCRIPT && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>脚本设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  脚本类型
                </span>
                <Select
                  value={formData.props?.scriptType || "API"}
                  onValueChange={(v) =>
                    handleChange("props", { ...formData.props, scriptType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GROOVY">Groovy 脚本</SelectItem>
                    <SelectItem value="JAVASCRIPT">JavaScript 脚本</SelectItem>
                    <SelectItem value="API">HTTP API 调用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.props?.scriptType === "GROOVY" ||
                formData.props?.scriptType === "JAVASCRIPT") && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    脚本内容
                  </span>
                  <LazyTextarea
                    className="min-h-[112px] font-mono text-[11px]"
                    placeholder={
                      formData.props?.scriptType === "GROOVY"
                        ? "def result = amount * 1.1\nreturn result"
                        : "const result = amount * 1.1;\nreturn result;"
                    }
                    value={formData.props?.scriptContent || ""}
                    onChange={(val: any) =>
                      handleChange("props", {
                        ...formData.props,
                        scriptContent: val,
                      })
                    }
                  />
                </div>
              )}
              {formData.props?.scriptType === "API" && (
                <>
                  <div>
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      API URL
                    </span>
                    <LazyInput
                      className="font-mono"
                      placeholder="https://api.example.com/endpoint"
                      value={formData.props?.apiUrl || ""}
                      onChange={(val: any) =>
                        handleChange("props", {
                          ...formData.props,
                          apiUrl: val,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      请求方法
                    </span>
                    <Select
                      value={formData.props?.apiMethod || "GET"}
                      onValueChange={(v) =>
                        handleChange("props", {
                          ...formData.props,
                          apiMethod: v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      请求头 (JSON)
                    </span>
                    <LazyTextarea
                      className="min-h-[64px] rounded-lg bg-slate-50/60 font-mono text-[11px] dark:bg-slate-950"
                      placeholder='{"Content-Type": "application/json"}'
                      value={formData.props?.apiHeaders || ""}
                      onChange={(val: any) =>
                        handleChange("props", {
                          ...formData.props,
                          apiHeaders: val,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      请求体 (JSON)
                    </span>
                    <LazyTextarea
                      className="min-h-[64px] rounded-lg bg-slate-50/60 font-mono text-[11px] dark:bg-slate-950"
                      placeholder='{"amount": "${amount}"}'
                      value={formData.props?.apiBody || ""}
                      onChange={(val: any) =>
                        handleChange("props", {
                          ...formData.props,
                          apiBody: val,
                        })
                      }
                    />
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="continueOnError"
                  className="rounded border-slate-300"
                  checked={formData.props?.continueOnError || false}
                  onChange={(e) =>
                    handleChange("props", {
                      ...formData.props,
                      continueOnError: e.target.checked,
                    })
                  }
                />
                <label
                  htmlFor="continueOnError"
                  className="text-xs text-slate-600"
                >
                  出错时继续执行
                </label>
              </div>
            </div>
          )}
          {node.type === NodeType.TIMER && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>定时设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  定时类型
                </span>
                <Select
                  value={formData.props?.timerType || "DELAY"}
                  onValueChange={(v) =>
                    handleChange("props", { ...formData.props, timerType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DELAY">延迟执行</SelectItem>
                    <SelectItem value="SCHEDULE">定时执行</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.props?.timerType === "DELAY" && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    延迟时间（分钟）
                  </span>
                  <LazyInput
                    type="number"
                    placeholder="例如: 60"
                    min="1"
                    value={formData.props?.delayMinutes || ""}
                    onChange={(val: any) =>
                      handleChange("props", {
                        ...formData.props,
                        delayMinutes: parseInt(val) || 0,
                      })
                    }
                  />
                </div>
              )}
              {formData.props?.timerType === "SCHEDULE" && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    定时时间
                  </span>
                  <DatePicker
                    type="datetime-local"
                    value={formData.props?.scheduleTime || ""}
                    onChange={(e) =>
                      handleChange("props", {
                        ...formData.props,
                        scheduleTime: e.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.SUBPROCESS && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>子流程设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  子流程ID
                </span>
                <LazyInput
                  placeholder="输入子流程的ID"
                  value={formData.props?.subprocessId || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      subprocessId: val,
                    })
                  }
                />
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  变量映射 (JSON)
                </span>
                <LazyTextarea
                  className="min-h-[88px] font-mono text-[11px]"
                  placeholder='{"subAmount": "${amount}", "subDays": "${days}"}'
                  value={formData.props?.variableMapping || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      variableMapping: val,
                    })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="waitForCompletion"
                  className="rounded border-slate-300"
                  checked={formData.props?.waitForCompletion !== false}
                  onChange={(e) =>
                    handleChange("props", {
                      ...formData.props,
                      waitForCompletion: e.target.checked,
                    })
                  }
                />
                <label
                  htmlFor="waitForCompletion"
                  className="text-xs text-slate-600"
                >
                  等待子流程完成
                </label>
              </div>
            </div>
          )}
          {node.type === NodeType.COPY && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>抄送设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  抄送人类型
                </span>
                <Select
                  value={formData.approverType || "USER"}
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">指定人员</SelectItem>
                    <SelectItem value="USERS">指定多人</SelectItem>
                    <SelectItem value="ROLE">按角色</SelectItem>
                    <SelectItem value="DEPT">按部门</SelectItem>
                    <SelectItem value="DEPT_MANAGER">部门负责人</SelectItem>
                    <SelectItem value="DIRECT_LEADER">直属上级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.approverType === "ROLE" && (
                <ApproverValueSelector
                  type="ROLE"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USER" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USERS" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
              {formData.approverType === "DEPT" && (
                <ApproverValueSelector
                  type="DEPT"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
            </div>
          )}
          {node.type === NodeType.MANUAL && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>人工任务设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  任务描述
                </span>
                <LazyTextarea
                  className="min-h-[88px]"
                  placeholder="描述需要人工处理的任务内容"
                  value={formData.props?.taskDescription || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      taskDescription: val,
                    })
                  }
                />
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  处理人类型
                </span>
                <Select
                  value={formData.approverType || "ROLE"}
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPROVER_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.approverType === "ROLE" && (
                <ApproverValueSelector
                  type="ROLE"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USER" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USERS" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
              {formData.approverType === "DEPT" && (
                <ApproverValueSelector
                  type="DEPT"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  任务优先级
                </span>
                <Select
                  value={formData.props?.priority || "MEDIUM"}
                  onValueChange={(v) =>
                    handleChange("props", { ...formData.props, priority: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">低</SelectItem>
                    <SelectItem value="MEDIUM">中</SelectItem>
                    <SelectItem value="HIGH">高</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {branchCount > 0 && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>分支规则</div>
              <Select
                value={normalizedBranchStrategy}
                onValueChange={(v) => handleChange("branchStrategy", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {branchStrategyOptions.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2 pt-3 border-t border-slate-100/80">
            <div className={studioSectionTitleClassName}>条件设置</div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                触发条件
              </span>
              <LazyInput
                className={`font-mono text-[11px]${!conditionValidation.valid ? " border-rose-400 focus:border-rose-500 focus:ring-rose-200" : ""}`}
                placeholder="例如: amount > 5000"
                value={formData.condition || ""}
                onChange={(val: any) => handleChange("condition", val)}
              />
              {!conditionValidation.valid && (
                <div className="mt-1 text-[10px] text-rose-500 dark:text-rose-400">
                  {conditionValidation.error}
                </div>
              )}
            </div>
          </div>
          {[
            NodeType.NOTIFICATION,
            NodeType.SCRIPT,
            NodeType.TIMER,
            NodeType.SUBPROCESS,
            NodeType.COPY,
          ].includes(node.type as NodeType) && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80 pb-3">
              <div className={studioSectionTitleClassName}>高级设置</div>

              <div className={studioSubtleBlockClassName}>
                <span className="text-xs text-slate-600 font-medium">
                  节点重试策略
                </span>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <span className="text-[10px] text-slate-400 mb-1 block">
                      最大重试次数
                    </span>
                    <LazyInput
                      type="number"
                      min="0"
                      placeholder="0"
                      value={formData.retry?.maxRetries ?? ""}
                      onChange={(val: any) =>
                        handleChange("retry", {
                          ...formData.retry,
                          maxRetries: val ? parseInt(val) : 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 mb-1 block">
                      重试间隔(毫秒)
                    </span>
                    <LazyInput
                      type="number"
                      min="0"
                      placeholder="1000"
                      value={formData.retry?.delayMs ?? ""}
                      onChange={(val: any) =>
                        handleChange("retry", {
                          ...formData.retry,
                          delayMs: val ? parseInt(val) : 1000,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className={studioSubtleBlockClassName}>
                <span className="text-xs text-slate-600 font-medium mb-1 block">
                  输入映射 (Inputs JSON)
                </span>
                <LazyTextarea
                  className="min-h-[64px] rounded-lg bg-white font-mono text-[11px] dark:bg-slate-950"
                  placeholder='{"orderId": "formData.id"}'
                  value={
                    formData.inputs
                      ? JSON.stringify(formData.inputs, null, 2)
                      : ""
                  }
                  onChange={(val: any) => {
                    if (!val) {
                      handleChange("inputs", undefined);
                      return;
                    }
                    // P1-6: 静默 catch{} → 显式 warn + toast，避免用户输入坏 JSON 时无感知地丢字段。
                    try {
                      handleChange("inputs", JSON.parse(val));
                    } catch (e) {
                      console.warn(
                        "[PropertyPanel] inputs JSON 解析失败",
                        { value: val, error: e },
                      );
                      toast.error("输入映射 (Inputs) JSON 解析失败，请检查格式");
                    }
                  }}
                />
              </div>

              <div className={studioSubtleBlockClassName}>
                <span className="text-xs text-slate-600 font-medium mb-1 block">
                  输出映射 (Outputs JSON)
                </span>
                <LazyTextarea
                  className="min-h-[64px] rounded-lg bg-white font-mono text-[11px] dark:bg-slate-950"
                  placeholder='{"formData.status": "resultStatus"}'
                  value={
                    formData.outputs
                      ? JSON.stringify(formData.outputs, null, 2)
                      : ""
                  }
                  onChange={(val: any) => {
                    if (!val) {
                      handleChange("outputs", undefined);
                      return;
                    }
                    // P1-6: 同上 inputs 处理
                    try {
                      handleChange("outputs", JSON.parse(val));
                    } catch (e) {
                      console.warn(
                        "[PropertyPanel] outputs JSON 解析失败",
                        { value: val, error: e },
                      );
                      toast.error("输出映射 (Outputs) JSON 解析失败，请检查格式");
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
