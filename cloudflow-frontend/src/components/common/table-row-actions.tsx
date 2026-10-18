import React from 'react';

/**
 * 行操作的数据契约。
 *
 * 这里只保留类型，不再提供渲染组件：全站行操作统一由页面直接输出
 * `<div className="admin-users-row-actions">` + 裸 `<button data-tooltip aria-label>`（15px 图标），
 * 以合同台账「当前操作」列为基准。历史上这里导出过 TableRowActions / ActionCell，
 * 内部用 Button variant="ghost" 渲染，透明无边框且超过 2 个操作会收进「更多」菜单，
 * 与基准列目视不一致，已全部改回基准写法。
 *
 * 消费方（HrDomainWorkspace / HrSubRecordCrudPage）按这份契约自行渲染基准按钮。
 */
export type TableRowActionTone =
  | 'primary'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type ActionSemanticKey =
  | 'view'
  | 'edit'
  | 'confirm'
  | 'submit'
  | 'process'
  | 'bind'
  | 'writeoff'
  | 'send'
  | 'enable'
  | 'disable'
  | 'reset'
  | 'copy'
  | 'open'
  | 'export'
  | 'archive'
  | 'void'
  | 'delete'
  | 'custom';

export interface TableRowActionItem {
  key?: React.Key;
  label: string;
  icon?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  hidden?: boolean;
  tone?: TableRowActionTone;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  tooltip?: string;
  permissionKey?: string;
  semantic?: ActionSemanticKey;
  danger?: boolean;
}
