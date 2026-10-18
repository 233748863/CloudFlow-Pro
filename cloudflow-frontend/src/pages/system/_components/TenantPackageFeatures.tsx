import React, { useMemo, useState } from 'react';
import { Input } from '@/components/common';
import type { TenantPackageAdjustments, TenantPackageCatalog, TenantPackageFeature } from '@/services/api/tenantPackage';
import { InfrastructureSelect } from './InfrastructurePrimitives';
import { featureAncestors } from './tenantPackageSelection';

interface Props {
  catalog: TenantPackageCatalog;
  selected: number[];
  disabled?: boolean;
  onChange?: (menuIds: number[]) => void;
  adjustments?: TenantPackageAdjustments;
  onAdjustmentsChange?: (adjustments: TenantPackageAdjustments) => void;
}

export function TenantPackageFeatures({ catalog, selected, disabled, onChange, adjustments, onAdjustmentsChange }: Props) {
  const [search, setSearch] = useState('');
  const indexed = useMemo(() => new Map(catalog.features.map(item => [item.menuId, item])), [catalog]);
  const describe = (feature: TenantPackageFeature) => {
    try { return featureAncestors(feature, catalog).reverse().map(item => item.menuName).join(' / '); }
    catch { return '上级目录异常'; }
  };
  const render = (feature: TenantPackageFeature) => {
    const fixed = feature.fixedAccountOperation;
    const chosen = fixed || selected.includes(feature.menuId);
    const adjustment = adjustments?.addMenuIds.includes(feature.menuId) ? 'ADD' : adjustments?.removeMenuIds.includes(feature.menuId) ? 'REMOVE' : 'INHERIT';
    return <div key={feature.menuId} className="package-feature" data-menu-id={feature.menuId}>
      <div className="min-w-0 flex-1">
        {adjustments ? <p className="text-sm font-medium">{feature.menuName}</p> : <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={chosen} disabled={disabled || fixed || !feature.enabled && !chosen} onChange={event => onChange?.(event.target.checked ? [...selected, feature.menuId] : selected.filter(menuId => menuId !== feature.menuId))} />{feature.menuName}
        </label>}
        <p className="break-words text-xs text-cf-subtle">{describe(feature) || '独立功能'} · {feature.menuId}{!feature.enabled ? ' · 已停用' : ''}</p>
        {feature.permissions && <code className="break-all text-xs text-cf-muted">{feature.permissions}</code>}
      </div>
      {fixed ? <span className="text-xs text-cf-muted">固定保留</span> : adjustments ? <InfrastructureSelect aria-label={`${feature.menuName}覆盖方式`} value={adjustment} disabled={disabled}
        options={[{ value: 'INHERIT', label: `沿用套餐（${chosen ? '包含' : '不包含'}）` }, { value: 'ADD', label: '额外开放' }, { value: 'REMOVE', label: '明确禁用' }]}
        onValueChange={value => onAdjustmentsChange?.({ ...adjustments, addMenuIds: [...adjustments.addMenuIds.filter(menuId => menuId !== feature.menuId), ...(value === 'ADD' ? [feature.menuId] : [])], removeMenuIds: [...adjustments.removeMenuIds.filter(menuId => menuId !== feature.menuId), ...(value === 'REMOVE' ? [feature.menuId] : [])] })} /> : null}
    </div>;
  };
  const matching = (feature: TenantPackageFeature) => `${feature.menuName} ${feature.menuId} ${feature.permissions ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  const groups = [
    { name: '账号基本操作（固定保留）', features: catalog.features.filter(feature => feature.fixedAccountOperation) },
    { name: '独立可选功能', features: catalog.features.filter(feature => feature.independentOperation && !feature.fixedAccountOperation) },
    { name: '页面、按钮与目录', features: catalog.features.filter(feature => !feature.independentOperation && !feature.fixedAccountOperation) },
  ];
  const unknown = [...new Set([...selected, ...(adjustments?.addMenuIds ?? []), ...(adjustments?.removeMenuIds ?? [])])].filter(menuId => !indexed.has(menuId));
  return <section className="space-y-3" aria-label="套餐功能选择">
    <p className="text-sm text-cf-muted">账号基本操作固定保留；独立功能未选即禁用。普通按钮必须同时选择所属页面，上级目录由服务器补齐。实际操作仍需原角色授权。</p>
    <label className="block space-y-2 text-sm">查找功能<Input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="名称、编号或权限" /></label>
    {unknown.length > 0 && <p role="alert">目录缺失功能：{unknown.join('、')}；请刷新并核对，当前选择未被自动清除。</p>}
    {groups.map(group => <details key={group.name} open={group.name !== '页面、按钮与目录' || Boolean(search)} className="rounded-md border border-[var(--cf-border)]">
      <summary className="min-h-11 cursor-pointer p-3 text-sm font-medium">{group.name}（{group.features.length}项）</summary>
      <div className="package-feature-grid">{group.features.filter(matching).map(render)}{!group.features.some(matching) && <p className="p-3 text-sm">无匹配功能</p>}</div>
    </details>)}
  </section>;
}
