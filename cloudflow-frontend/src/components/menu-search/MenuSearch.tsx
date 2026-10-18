import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, Search, TrendingUp, X } from 'lucide-react';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Button } from '@/components/common/button';
import { Input } from '@/components/common/input';
import { cn } from '@/utils/cn';
import { getIcon } from '@/utils/iconMapper';
import { useBusinessSearch } from '@/hooks/useBusinessSearch';
import { BUSINESS_SEARCH_META, type BusinessSearchHit } from '@/utils/businessSearch';
import {
  isMenuSearchComposing, isMenuSearchShortcut, limitMenuSearchKeyword,
  MENU_SEARCH_KEYWORD_LIMIT, MENU_SEARCH_RESULT_LIMIT, nextMenuSearchIndex, searchMenus,
  type FlatMenuItem, type PinyinMatcher,
} from '@/utils/menuSearch';

interface MenuSearchProps {
  items: FlatMenuItem[];
  recent: FlatMenuItem[];
  frequent: FlatMenuItem[];
  loading: boolean;
  failed: boolean;
  enabled: boolean;
  compact?: boolean;
  onRetry: () => void;
  onNavigate: (menuId: string) => boolean;
  businessEnabled?: boolean;
  onBusinessNavigate?: (item: BusinessSearchHit) => boolean;
}

type SearchChoice = FlatMenuItem | BusinessSearchHit;
const isBusinessChoice = (item: SearchChoice): item is BusinessSearchHit => 'type' in item;
const choiceKey = (item: SearchChoice) => isBusinessChoice(item) ? `business:${item.type}:${item.id}` : `menu:${item.id}`;

export const MenuSearch = ({ items, recent, frequent, loading, failed, enabled, compact, onRetry, onNavigate, businessEnabled = false, onBusinessNavigate }: MenuSearchProps) => {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selection, setSelection] = useState({ key: '', index: 0 });
  const [pinyinMatch, setPinyinMatch] = useState<PinyinMatcher | null>(null);
  const [pinyinFailed, setPinyinFailed] = useState(false);
  const [composing, setComposing] = useState(false);
  const business = useBusinessSearch(keyword, open && enabled && businessEnabled && !loading && !failed, composing);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const openRef = useRef(false);
  const listId = useId();
  const statusId = useId();
  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    setKeyword('');
    setSelection({ key: '', index: 0 });
    setComposing(false);
    composingRef.current = false;
  }, []);
  const show = useCallback(() => {
    openRef.current = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open || pinyinMatch) return;
    let current = true;
    setPinyinFailed(false);
    void import('pinyin-match').then((module) => {
      if (current) setPinyinMatch(() => module.default.match);
    }).catch(() => {
      if (current) setPinyinFailed(true);
    });
    return () => { current = false; };
  }, [open, pinyinMatch]);

  useEffect(() => {
    if (!enabled) close();
  }, [enabled, close]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled || event.defaultPrevented || isMenuSearchComposing(event, composingRef.current)) return;
      const isOpen = openRef.current;
      const dialog = inputRef.current?.closest('[role="dialog"]');
      if (isOpen && event.key === 'Escape' && dialog?.contains(document.activeElement)) {
        event.preventDefault();
        close();
        return;
      }
      if (!isMenuSearchShortcut(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!isOpen && target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .monaco-editor, .cm-editor, .CodeMirror')) return;
      if (!isOpen && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (isOpen && !dialog?.contains(document.activeElement)) return;
      event.preventDefault();
      show();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('cloudflow:auth-expired', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('cloudflow:auth-expired', close);
    };
  }, [enabled, show, close]);

  const matches = useMemo(() => searchMenus(items, keyword, pinyinMatch), [items, keyword, pinyinMatch]);
  const searching = Boolean(keyword.trim());
  const menuGroups = loading || failed ? [] : searching
    ? [{ label: '搜索结果', items: matches.items, icon: Search }]
    : [{ label: '最近访问', items: recent, icon: Clock3 }, { label: '常用功能', items: frequent, icon: TrendingUp }];
  const groups: { label: string; items: SearchChoice[]; icon: typeof Search }[] = [
    ...menuGroups,
    ...business.groups.map(group => ({ label: BUSINESS_SEARCH_META[group.type].label, items: group.items, icon: Search })),
  ];
  const options = groups.flatMap((group) => group.items);
  const selectionKey = JSON.stringify([keyword, options.map(choiceKey)]);
  const selectedIndex = options.length ? selection.key === selectionKey ? Math.min(selection.index, options.length - 1) : 0 : -1;
  const activeOptionId = selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined;

  useEffect(() => {
    if (open && activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeOptionId, selectionKey]);

  const select = (item: SearchChoice) => {
    if (!loading && !failed && enabled && (isBusinessChoice(item)
      ? businessEnabled && onBusinessNavigate?.(item) : onNavigate(item.id))) close();
  };
  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isMenuSearchComposing(event.nativeEvent, composingRef.current)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelection({ key: selectionKey, index: nextMenuSearchIndex(selectedIndex, options.length, event.key === 'ArrowDown' ? 1 : -1) });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = options[selectedIndex];
      if (selected) select(selected);
    }
  };

  const menuResultLabel = businessEnabled ? '菜单' : '功能';
  const status = loading ? '正在加载菜单…' : failed ? '菜单加载失败，请重试。' : !items.length ? '暂无可用菜单。'
    : searching ? matches.total ? `找到 ${matches.total} 个${menuResultLabel}${matches.total > MENU_SEARCH_RESULT_LIMIT ? `，仅显示前 ${MENU_SEARCH_RESULT_LIMIT} 条，请缩小范围` : ''}` : `未找到匹配${menuResultLabel}，请更换关键词。`
      : options.length ? `最近访问 ${recent.length} 项，常用功能 ${frequent.length} 项。` : '暂无访问记录，输入关键词查找功能。';
  let optionIndex = 0;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        disabled={!enabled}
        className="!h-[44px] !min-h-[44px] !min-w-[44px] shrink-0 gap-2 !px-3 text-cf-muted"
        aria-label="搜索功能（Ctrl 或 Command 加 K）"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Control+k Meta+k"
        onClick={show}
      >
        <Search size={18} aria-hidden="true" />
        {!compact ? <><span className="hidden md:inline">搜索功能</span><kbd className="hidden rounded border border-[var(--cf-border)] px-1.5 py-0.5 text-[10px] text-cf-subtle lg:inline">Ctrl/Cmd+K</kbd></> : null}
      </Button>
      <BaseDialog
        open={open && enabled}
        title="搜索功能"
        onClose={close}
        closeOnClickOutside
        closeOnEscape={false}
        hideCloseButton
        maxWidthClassName="max-w-2xl"
        panelClassName="animate-fade-in [animation-duration:200ms] motion-reduce:animate-none"
        bodyClassName="!overflow-hidden !p-0"
        headerAside={<Button type="button" variant="ghost" className="!h-[44px] !min-h-[44px] !min-w-[44px] gap-1 !px-2" onClick={close} aria-label="关闭搜索"><kbd className="text-xs text-cf-subtle">Esc</kbd><X size={18} aria-hidden="true" /></Button>}
        footer={<p className="text-xs text-cf-subtle">↑↓ 选择 · Enter 打开 · Esc 关闭</p>}
        footerClassName="!justify-start"
      >
        <div className="p-4">
          <label htmlFor={`${listId}-input`} className="sr-only">输入名称、拼音首字母或菜单路径，最多 {MENU_SEARCH_KEYWORD_LIMIT} 字符</label>
          <Input
            id={`${listId}-input`}
            ref={inputRef}
            data-autofocus
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-describedby={statusId}
            className="!h-[44px] !min-h-[44px]"
            placeholder={businessEnabled ? '搜索功能或业务名称、编号' : '输入名称、拼音首字母或菜单路径'}
            value={keyword}
            onChange={(event) => setKeyword(limitMenuSearchKeyword(event.target.value))}
            onCompositionStart={() => { composingRef.current = true; setComposing(true); }}
            onCompositionEnd={(event) => { composingRef.current = false; setComposing(false); setKeyword(limitMenuSearchKeyword(event.currentTarget.value)); }}
            onKeyDown={onInputKeyDown}
          />
        </div>
        <div id={listId} role="listbox" aria-label="可访问功能" aria-busy={loading || business.phase === 'loading'} className="max-h-[min(50dvh,24rem)] min-h-0 overflow-y-auto overscroll-contain px-2">
          {groups.map((group) => group.items.length ? (
            <div key={group.label} role="group" aria-label={group.label} className="pb-2">
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-cf-subtle" aria-hidden="true"><group.icon size={13} />{group.label}</div>
              {group.items.map((item) => {
                const index = optionIndex++;
                const businessItem = isBusinessChoice(item);
                const Icon = getIcon(businessItem ? 'Search' : item.icon);
                return (
                  <div
                    key={choiceKey(item)}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={selectedIndex === index}
                    className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-cf-body transition-colors duration-150', selectedIndex === index ? 'bg-[var(--cf-surface-muted)] text-cf-title ring-1 ring-inset ring-[var(--cf-border)]' : 'hover:bg-[var(--cf-surface-muted)]')}
                    onPointerMove={(event) => { if (event.pointerType === 'mouse') setSelection({ key: selectionKey, index }); }}
                    onPointerDown={(event) => { if (event.pointerType === 'mouse') event.preventDefault(); }}
                    onClick={() => select(item)}
                  >
                    <Icon size={17} className="shrink-0 text-cf-subtle" aria-hidden="true" />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{businessItem ? item.title : item.label}</div><div className="truncate text-xs text-cf-subtle">{businessItem ? [item.number, item.status].filter(Boolean).join(' · ') : item.groupLabel}</div></div>
                    <ArrowUpRight size={15} className="shrink-0 text-cf-subtle" aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          ) : null)}
        </div>
        <div className="space-y-2 px-4 pb-4 pt-2">
          <p id={statusId} role="status" aria-live="polite" aria-atomic="true" className="text-xs leading-6 text-cf-subtle">{status}</p>
          {businessEnabled && <div role="status" aria-live="polite" className="max-h-28 overflow-y-auto text-xs leading-6 text-cf-subtle">
            {!business.active && <p>输入2至64个字符可搜索业务名称或编号。</p>}
            {business.active && (!business.phase || business.phase === 'waiting' || business.phase === 'loading') && <p>正在查询可访问的业务…</p>}
            {business.phase === 'failed' && <><p>{business.error}</p><Button type="button" variant="outline" className="!min-h-[44px]" onClick={business.retry}>重新搜索业务</Button></>}
            {business.groups.map(group => group.state === 'UNAVAILABLE' || group.state === 'FORBIDDEN' || !group.items.length || group.hasMore
              ? <p key={group.type}>{BUSINESS_SEARCH_META[group.type].label}：{group.state === 'UNAVAILABLE' ? '暂不可用，请稍后重试。' : group.state === 'FORBIDDEN' ? '没有查询权限。' : !group.items.length ? '暂无匹配记录。' : '仅显示前5条，请缩小关键词。'}</p> : null)}
          </div>}
          {failed ? <Button type="button" variant="outline" className="!min-h-[44px]" onClick={onRetry}>重新加载菜单</Button> : null}
          {!pinyinMatch ? <p className="text-xs text-cf-subtle">{pinyinFailed ? '拼音匹配暂不可用，可继续按名称或路径搜索。' : '正在准备拼音匹配，名称和路径已可搜索。'}</p> : null}
        </div>
      </BaseDialog>
    </>
  );
};
