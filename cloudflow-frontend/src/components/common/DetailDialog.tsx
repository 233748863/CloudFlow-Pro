import React from 'react';
import { cn } from '@/utils/cn';
import { BaseDialog } from '@/components/common/BaseDialog';
import type { BaseDialogWidth } from '@/components/common/BaseDialog';

/**
 * 只读详情弹窗的共用件。
 *
 * 立项原因：项目里有 25 处页面各自本地定义了形状完全一样的 DialogPanel /
 * DetailField / DetailSection，共用的只有 CSS 类，barrel 里一个都没导出。
 * 结果是「加一个查看按钮」要先抄 40 行样板，于是 42 个页面干脆只做了编辑、
 * 没有查看入口。这里把那套形状收敛成组件，新页面直接用。
 *
 * 约定（与资产台账、印章、证照、车辆那几个既有详情弹窗一致）：
 * - 查看是只读操作，不做权限门禁；能进列表就能看详情。编辑/删除仍各自受限。
 * - 查看按钮排在行内操作区第一位，Eye 图标，15px。
 * - 不复用编辑表单再 disabled：只读态用 DetailField 平铺，避免表单校验和
 *   脏值状态混进只读场景。
 */

export interface DetailFieldItem {
  label: string;
  value: React.ReactNode;
  /** 占满整行，适合备注、地址这类长文本。 */
  wide?: boolean;
  /** 传 false 可整项隐藏，省去调用方写条件展开。 */
  visible?: boolean;
}

/** 详情弹窗里的单个字段项。 */
export const DetailField: React.FC<{
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}> = ({ label, value, wide }) => (
  <div className={cn('admin-detail-item', wide && 'admin-source-form-wide')}>
    <div className="text-[11px] font-medium text-cf-faint">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-cf-title">
      {/* 用 nullish 判断而不是 value || '-'：数字 0 和空字符串是有效值，
          用 || 会把「重试 0 次」错显成「无数据」。 */}
      {value === null || value === undefined || value === '' ? '-' : value}
    </div>
  </div>
);

/** 弹窗内的分区壳，带标题栏和分隔线。 */
export const DetailPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, actions, className, bodyClassName, children }) => (
  <section className={cn('table-scroll-container admin-inner-table-surface', className)}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={cn('p-4', bodyClassName)}>{children}</div>
  </section>
);

/** 一组字段铺成栅格，窄屏 1 列、640px 起 2 列、1024px 起 3 列。 */
export const DetailFieldGrid: React.FC<{
  items: DetailFieldItem[];
  className?: string;
}> = ({ items, className }) => (
  <div className={cn('admin-detail-grid', className)}>
    {items
      .filter((item) => item.visible !== false)
      .map((item) => (
        <DetailField key={item.label} label={item.label} value={item.value} wide={item.wide} />
      ))}
  </div>
);

export interface DetailSectionSpec {
  title: string;
  description?: string;
  /** 字段区；与 content 二选一。 */
  items?: DetailFieldItem[];
  /** 自定义内容，用于正文、时间线这类非字段结构。 */
  content?: React.ReactNode;
  visible?: boolean;
}

/**
 * 只读详情弹窗。传 sections 即可，标题栏可选带副标题和右上角徽标。
 */
export const DetailDialog: React.FC<{
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  sections: DetailSectionSpec[];
  /** 标题下方的主标题行，通常是记录名称。 */
  heading?: React.ReactNode;
  /** 主标题下的一行灰字，通常是分类、时间这类次要信息。 */
  subheading?: React.ReactNode;
  /** 主标题行右侧，通常放状态徽标。 */
  headingAside?: React.ReactNode;
  footer?: React.ReactNode;
  width?: BaseDialogWidth;
  /**
   * 叠在另一个弹窗之上时要抬高，否则两层同为 50，
   * 谁在上面只取决于 DOM 顺序，改一行 JSX 就可能翻车。
   */
  zIndex?: number;
}> = ({ open, title, onClose, sections, heading, subheading, headingAside, footer, width = 'wide', zIndex }) => (
  <BaseDialog open={open} title={title} onClose={onClose} footer={footer} width={width} zIndex={zIndex}>
    <div className="admin-dialog-stack">
      {heading || subheading || headingAside ? (
        <div className="admin-dialog-subhead">
          <div>
            {heading ? <strong>{heading}</strong> : null}
            {subheading ? <span>{subheading}</span> : null}
          </div>
          {headingAside}
        </div>
      ) : null}
      {sections
        .filter((section) => section.visible !== false)
        .map((section) => (
          <DetailPanel
            key={section.title}
            title={section.title}
            description={section.description}
            bodyClassName={section.items ? 'admin-detail-grid' : undefined}
          >
            {section.items
              ? section.items
                  .filter((item) => item.visible !== false)
                  .map((item) => (
                    <DetailField key={item.label} label={item.label} value={item.value} wide={item.wide} />
                  ))
              : section.content}
          </DetailPanel>
        ))}
    </div>
  </BaseDialog>
);
