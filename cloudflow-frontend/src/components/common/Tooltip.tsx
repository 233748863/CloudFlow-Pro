import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

/** 视口边缘留白，避免贴边 */
const VIEWPORT_MARGIN = 8;
/** 气泡与锚点的间距 */
const ANCHOR_GAP = 8;
/** hover 触发的延迟，避免鼠标划过时闪烁 */
const HOVER_OPEN_DELAY = 120;

interface Position {
  top: number;
  left: number;
  placement: TooltipPlacement;
  ready: boolean;
}

const INITIAL_POSITION: Position = { top: 0, left: 0, placement: 'top', ready: false };

/**
 * 计算气泡位置：优先使用期望方向，空间不足时翻转，最后统一夹到视口内。
 * 用视口坐标配合 position: fixed，不混用 scrollY，滚动时重新计算即可。
 */
function computePosition(
  anchor: DOMRect,
  panel: { width: number; height: number },
  preferred: TooltipPlacement,
): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fits: Record<TooltipPlacement, boolean> = {
    top: anchor.top - panel.height - ANCHOR_GAP >= VIEWPORT_MARGIN,
    bottom: anchor.bottom + panel.height + ANCHOR_GAP <= vh - VIEWPORT_MARGIN,
    left: anchor.left - panel.width - ANCHOR_GAP >= VIEWPORT_MARGIN,
    right: anchor.right + panel.width + ANCHOR_GAP <= vw - VIEWPORT_MARGIN,
  };

  const opposite: Record<TooltipPlacement, TooltipPlacement> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };

  const placement = fits[preferred] ? preferred : fits[opposite[preferred]] ? opposite[preferred] : preferred;

  let top: number;
  let left: number;

  if (placement === 'top' || placement === 'bottom') {
    top =
      placement === 'top'
        ? anchor.top - panel.height - ANCHOR_GAP
        : anchor.bottom + ANCHOR_GAP;
    left = anchor.left + anchor.width / 2 - panel.width / 2;
  } else {
    top = anchor.top + anchor.height / 2 - panel.height / 2;
    left =
      placement === 'left'
        ? anchor.left - panel.width - ANCHOR_GAP
        : anchor.right + ANCHOR_GAP;
  }

  left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vw - panel.width - VIEWPORT_MARGIN));
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vh - panel.height - VIEWPORT_MARGIN));

  return { top, left, placement, ready: true };
}

/** 箭头相对气泡的定位类，方向与气泡实际落位一致 */
const ARROW_CLASS: Record<TooltipPlacement, string> = {
  top: '-bottom-1 left-1/2 -translate-x-1/2',
  bottom: '-top-1 left-1/2 -translate-x-1/2',
  left: '-right-1 top-1/2 -translate-y-1/2',
  right: '-left-1 top-1/2 -translate-y-1/2',
};

interface TooltipPanelProps {
  id: string;
  content: React.ReactNode;
  anchor: HTMLElement | null;
  placement: TooltipPlacement;
  widthClass?: string;
  onRequestClose?: () => void;
  showCloseButton?: boolean;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * 气泡本体。渲染到 body，测量完成前用 visibility: hidden 占位，
 * 避免第一帧出现在错误位置造成跳动。
 */
const TooltipPanel: React.FC<TooltipPanelProps> = ({
  id,
  content,
  anchor,
  placement,
  widthClass,
  onRequestClose,
  showCloseButton = false,
  panelRef,
}) => {
  const localRef = useRef<HTMLDivElement | null>(null);
  const ref = panelRef ?? localRef;
  const [position, setPosition] = useState<Position>(INITIAL_POSITION);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition(
      computePosition(rect, { width: el.offsetWidth, height: el.offsetHeight }, placement),
    );
  }, [anchor, placement, ref]);

  useLayoutEffect(() => {
    update();
  }, [update, content]);

  useEffect(() => {
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [update]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={cn(
        'cf-tooltip-panel pointer-events-none fixed z-[200] rounded-md bg-slate-900 px-2.5 py-1.5',
        'text-xs leading-5 text-slate-50 shadow-lg ring-1 ring-white/10 dark:bg-slate-800',
        showCloseButton && 'pointer-events-auto pr-7',
        widthClass ?? 'max-w-xs',
      )}
      style={{
        top: position.top,
        left: position.left,
        visibility: position.ready ? 'visible' : 'hidden',
      }}
    >
      {showCloseButton ? (
        <button
          type="button"
          aria-label="关闭提示"
          className="absolute right-1 top-1 rounded p-0.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            onRequestClose?.();
          }}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
      <span className="whitespace-pre-line break-words">{content}</span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute h-2 w-2 rotate-45 bg-slate-900 dark:bg-slate-800',
          ARROW_CLASS[position.placement],
        )}
      />
    </div>,
    document.body,
  );
};

export interface TooltipProps {
  /** 提示内容，支持任意 ReactNode */
  content: React.ReactNode;
  /** 触发元素，必须是能接收 ref 的单个元素 */
  children: React.ReactElement;
  /** hover（默认）或 click。click 模式会渲染关闭按钮 */
  trigger?: 'hover' | 'click';
  /** 期望方向，空间不足时自动翻转 */
  placement?: TooltipPlacement;
  /** 覆盖默认的 max-w-xs */
  widthClass?: string;
  /** 临时关掉提示（例如禁用态） */
  disabled?: boolean;
}

/**
 * 提示气泡。对标源站 unity2.ai 的 HelpTooltip，并补上键盘可达性。
 *
 * 关键设计：用 cloneElement 把事件与 ref 直接挂到子元素上，**不额外包一层 DOM**，
 * 因此替换原生 title 时不会影响任何 flex / grid 布局。
 *
 * 相比原生 title 的改进：触屏可用、可样式化、无 ~1s 延迟、
 * Esc 可关、通过 aria-describedby 关联给屏幕阅读器。
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  trigger = 'hover',
  placement = 'top',
  widthClass,
  disabled = false,
}) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const openNow = useCallback(() => {
    clearTimer();
    setOpen(true);
  }, [clearTimer]);

  const openDelayed = useCallback(() => {
    clearTimer();
    openTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_DELAY);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  // Esc 关闭；click 模式下点击气泡与锚点之外也关闭
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onDocClick = (event: MouseEvent) => {
      if (trigger !== 'click') return;
      const target = event.target as Node | null;
      if (!target) return;
      if (anchor?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onDocClick, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onDocClick, true);
    };
  }, [open, trigger, anchor, close]);

  if (disabled || content === null || content === undefined || content === '') {
    return children;
  }

  type AnchorProps = {
    ref?: React.Ref<HTMLElement>;
    'aria-describedby'?: string;
    onMouseEnter?: React.MouseEventHandler<HTMLElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLElement>;
    onFocus?: React.FocusEventHandler<HTMLElement>;
    onBlur?: React.FocusEventHandler<HTMLElement>;
    onClick?: React.MouseEventHandler<HTMLElement>;
  };

  const childProps = children.props as AnchorProps;
  // React 19 起 ref 就是普通 prop，从 props 上读，避免访问已移除的 element.ref
  const childRef = childProps.ref;

  const merged: AnchorProps = {
    ref: (node: HTMLElement | null) => {
      setAnchor(node);
      if (typeof childRef === 'function') childRef(node);
      else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    'aria-describedby': open ? id : childProps['aria-describedby'],
    onMouseEnter: (event) => {
      childProps.onMouseEnter?.(event);
      if (trigger === 'hover') openDelayed();
    },
    onMouseLeave: (event) => {
      childProps.onMouseLeave?.(event);
      if (trigger === 'hover') close();
    },
    // 键盘 Tab 聚焦也要能看到提示，这是原生 title 做不到的
    onFocus: (event) => {
      childProps.onFocus?.(event);
      if (trigger === 'hover') openNow();
    },
    onBlur: (event) => {
      childProps.onBlur?.(event);
      close();
    },
    onClick: (event) => {
      childProps.onClick?.(event);
      if (trigger === 'click') {
        event.stopPropagation();
        if (open) close();
        else openNow();
      }
    },
  };

  return (
    <>
      {React.cloneElement(children, merged as Partial<unknown> & React.Attributes)}
      {open ? (
        <TooltipPanel
          id={id}
          content={content}
          anchor={anchor}
          placement={placement}
          widthClass={widthClass}
          panelRef={panelRef}
          showCloseButton={trigger === 'click'}
          onRequestClose={close}
        />
      ) : null}
    </>
  );
};

/** 全局委托层读取的属性名 */
const TOOLTIP_ATTR = 'data-tooltip';
const PLACEMENT_ATTR = 'data-tooltip-placement';

function isPlacement(value: string | null): value is TooltipPlacement {
  return value === 'top' || value === 'bottom' || value === 'left' || value === 'right';
}

/**
 * 全局提示层：接管所有带 `data-tooltip="…"` 的元素。
 *
 * 之所以做成委托层而不是让每个按钮都包一个 <Tooltip>：
 * 原生 title 的替换涉及 353 处、其中 309 处在 <button> 上，
 * 逐个包组件会引入 300+ 个组件实例，而属性化方案只改一个属性名，
 * DOM 结构零变化、只有一个气泡实例，迁移风险和运行开销都最低。
 *
 * 需要富文本 / 受控 / click 触发时，仍然用上面的 <Tooltip> 组件。
 * 在 App 根节点挂一次即可。
 */
export const TooltipLayer: React.FC = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<string>('');
  const [placement, setPlacement] = useState<TooltipPlacement>('top');
  const timer = useRef<number | null>(null);
  const id = useId();

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clear();
    setAnchor(null);
    setContent('');
  }, [clear]);

  const show = useCallback(
    (el: HTMLElement, immediate: boolean) => {
      const text = el.getAttribute(TOOLTIP_ATTR);
      if (!text) return;
      const raw = el.getAttribute(PLACEMENT_ATTR);
      clear();
      const apply = () => {
        setAnchor(el);
        setContent(text);
        setPlacement(isPlacement(raw) ? raw : 'top');
      };
      if (immediate) apply();
      else timer.current = window.setTimeout(apply, HOVER_OPEN_DELAY);
    },
    [clear],
  );

  useEffect(() => {
    const resolve = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest(`[${TOOLTIP_ATTR}]`) as HTMLElement | null;
    };

    const onOver = (event: MouseEvent) => {
      const el = resolve(event.target);
      if (el) show(el, false);
      else if (anchor) hide();
    };
    const onOut = (event: MouseEvent) => {
      const el = resolve(event.target);
      if (el && el === anchor) hide();
    };
    // Tab 聚焦即显示，这是原生 title 缺失的能力
    const onFocusIn = (event: FocusEvent) => {
      const el = resolve(event.target);
      if (el) show(el, true);
    };
    const onFocusOut = () => hide();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    // 触屏上没有 hover，点一下也给出提示
    const onTouchStart = (event: TouchEvent) => {
      const el = resolve(event.target);
      if (el) show(el, true);
      else hide();
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('touchstart', onTouchStart, true);
    window.addEventListener('blur', hide);

    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('blur', hide);
    };
  }, [anchor, show, hide]);

  useEffect(() => clear, [clear]);

  // 显示期间把气泡关联到锚点，退出时还原，避免留下悬空的 aria-describedby
  useEffect(() => {
    if (!anchor) return;
    const previous = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('aria-describedby', id);
    return () => {
      if (previous) anchor.setAttribute('aria-describedby', previous);
      else anchor.removeAttribute('aria-describedby');
    };
  }, [anchor, id]);

  if (!anchor || !content) return null;

  return <TooltipPanel id={id} content={content} anchor={anchor} placement={placement} />;
};
