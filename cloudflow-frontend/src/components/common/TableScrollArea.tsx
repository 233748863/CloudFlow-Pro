import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import './TableScrollArea.css';

export interface TableScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 短表保持自然高度，长表超过该高度后在容器内纵向滚动。 */
  maxHeight?: React.CSSProperties['maxHeight'];
}

/** 为吸顶表头和冻结列提供统一的横纵滚动坐标系。 */
export const TableScrollArea = React.forwardRef<HTMLDivElement, TableScrollAreaProps>(
  ({ className, children, maxHeight = 'clamp(20rem, 52vh, 34rem)', style, ...props }, ref) => {
    const localRef = useRef<HTMLDivElement | null>(null);
    const [isScrollable, setIsScrollable] = useState(false);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const syncScrollable = useCallback(() => {
      const node = localRef.current;
      if (!node) return;
      setIsScrollable(node.scrollWidth - node.clientWidth > 1);
    }, []);

    useEffect(() => {
      const node = localRef.current;
      if (!node) return;

      syncScrollable();
      const resizeObserver = new ResizeObserver(syncScrollable);
      resizeObserver.observe(node);
      const table = node.querySelector('table');
      if (table) resizeObserver.observe(table);

      const mutationObserver = new MutationObserver(syncScrollable);
      mutationObserver.observe(node, { childList: true, subtree: true });

      return () => {
        resizeObserver.disconnect();
        mutationObserver.disconnect();
      };
    }, [children, syncScrollable]);

    return (
      <div
        ref={setRefs}
        className={cn('cf-table-scroll-area table-wrapper', isScrollable && 'is-scrollable', className)}
        style={{ ...style, maxHeight }}
        tabIndex={isScrollable ? 0 : undefined}
        {...props}
      >
        {children}
      </div>
    );
  },
);

TableScrollArea.displayName = 'TableScrollArea';
