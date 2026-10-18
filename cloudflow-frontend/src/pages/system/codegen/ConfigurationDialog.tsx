import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Switch, Textarea } from '@/components/common';
import { saveCodegenConfiguration } from '@/services/api/codegen';
import type { CodegenColumn, CodegenDetail, CodegenOptions, CodegenTable } from '@/services/api/codegen';
import { dictTypeApi } from '@/services/api/dict';
import type { SysDictType } from '@/services/api/dict';
import { getMenuList } from '@/services/api/menu';
import type { MenuItem } from '@/services/api/menu';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureField, InfrastructureSelect, infrastructureCheckboxClassName } from '../_components/InfrastructurePrimitives';

const templateLabels: Record<string, string> = {
  CRUD: '标准增删改查', TREE: '树形结构', SUB: '主子表', INNER: '服务内部接口', HR_TYPED: '人事通用配置',
};
const columnFlags = [
  ['requiredFlag', '必填'], ['insertFlag', '新增'], ['editFlag', '编辑'], ['listFlag', '列表'], ['queryFlag', '查询'],
] as const;
const flattenMenus = (items: MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flattenMenus(item.children || [])]);

export function ConfigurationDialog({ detail, options, onClose, onSaved }: {
  detail: CodegenDetail;
  options: CodegenOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<CodegenDetail>(() => ({ table: { ...detail.table }, columns: detail.columns.map((column) => ({ ...column })) }));
  const [tab, setTab] = useState<'table' | 'columns'>('table');
  const [saving, setSaving] = useState(false);
  const [dictTypes, setDictTypes] = useState<SysDictType[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [optionError, setOptionError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([dictTypeApi.optionselect(), getMenuList()]).then(([dictResult, menuResult]) => {
      if (!active) return;
      if (dictResult.status === 'fulfilled') setDictTypes(dictResult.value);
      if (menuResult.status === 'fulfilled' && Array.isArray(menuResult.value)) setMenus(flattenMenus(menuResult.value));
      if (dictResult.status === 'rejected' || menuResult.status === 'rejected') setOptionError('部分字典或菜单选项读取失败，已保存的配置仍会保留。');
    });
    return () => { active = false; };
  }, []);

  const updateTable = <Key extends keyof CodegenTable>(key: Key, value: CodegenTable[Key]) =>
    setDraft((current) => ({ ...current, table: { ...current.table, [key]: value } }));
  const updateColumn = <Key extends keyof CodegenColumn>(columnName: string, key: Key, value: CodegenColumn[Key]) =>
    setDraft((current) => ({ ...current, columns: current.columns.map((column) => column.columnName === columnName ? { ...column, [key]: value } : column) }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!draft.table.className.trim() || !draft.table.businessName.trim() || !draft.table.packageName.trim() || !draft.table.functionName.trim()) {
      setTab('table');
      toast.error('请补全业务名、实体类名、功能名称和包路径');
      return;
    }
    // 树表的父级字段和名称字段原来靠原生 select 的 required 拦截，换成共用 Select
    // （渲染成 button）后浏览器不再校验，这里必须显式补上，否则会提交空字段。
    if (draft.table.tplCategory === 'TREE' && (!draft.table.treeParentCode || !draft.table.treeNameCode)) {
      setTab('table');
      toast.error('树表模板需要选择父级字段和名称字段');
      return;
    }
    setSaving(true);
    try {
      await saveCodegenConfiguration(draft);
      toast.success('代码生成配置已保存');
      onSaved();
    } catch (reason) { toast.error(getErrorMessage(reason, '保存生成配置失败')); }
    finally { setSaving(false); }
  };
  const values = (entries: string[]) => entries.map((value) => ({ value, label: value }));
  const fieldOptions = [{ value: '', label: '选择字段' }, ...draft.columns.map((column) => ({ value: column.columnName, label: `${column.columnName} · ${column.columnComment || column.javaField}` }))];
  const menuOptions = [
    { value: '', label: '未指定' }, { value: '0', label: '顶级菜单' },
    ...menus.filter((menu) => menu.menuType !== 'F').map((menu) => ({ value: String(menu.menuId), label: `${menu.menuName}（${menu.menuId}）` })),
  ];
  if (draft.table.parentMenuId != null && !menuOptions.some((option) => option.value === String(draft.table.parentMenuId))) {
    menuOptions.push({ value: String(draft.table.parentMenuId), label: `已保存菜单（${draft.table.parentMenuId}）` });
  }

  return (
    <BaseDialog open title={`生成配置：${draft.table.tableName}`} width="full" onClose={() => { if (!saving) onClose(); }} footer={<><Button variant="outline" disabled={saving} onClick={onClose}>取消</Button><Button type="submit" form="codegen-config-form" disabled={saving}>{saving ? '保存中…' : '保存配置'}</Button></>}>
      <div className="mb-5 flex gap-2" role="tablist" aria-label="代码生成配置">
        <Button role="tab" aria-selected={tab === 'table'} variant={tab === 'table' ? 'default' : 'outline'} onClick={() => setTab('table')}>表与生成规则</Button>
        <Button role="tab" aria-selected={tab === 'columns'} variant={tab === 'columns' ? 'default' : 'outline'} onClick={() => setTab('columns')}>字段配置（{draft.columns.length}）</Button>
      </div>
      {optionError && <p role="status" className="mb-4 text-sm text-cf-muted">{optionError}</p>}
      <form id="codegen-config-form" onSubmit={save}>
        {tab === 'table' ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfrastructureField label="表说明"><Input maxLength={200} value={draft.table.tableComment || ''} onChange={(event) => updateTable('tableComment', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="所属模块"><InfrastructureSelect value={draft.table.moduleName} options={values(options.modules)} onValueChange={(value) => updateTable('moduleName', value)} /></InfrastructureField>
          <InfrastructureField label="模板类型"><InfrastructureSelect value={draft.table.tplCategory} options={options.templateCategories.map((value) => ({ value, label: templateLabels[value] || value }))} onValueChange={(value) => updateTable('tplCategory', value)} /></InfrastructureField>
          <InfrastructureField label="业务名" hint="用于接口路径和权限码"><Input required maxLength={50} value={draft.table.businessName} onChange={(event) => updateTable('businessName', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="实体类名"><Input required maxLength={100} value={draft.table.className} onChange={(event) => updateTable('className', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="功能名称"><Input required maxLength={100} value={draft.table.functionName} onChange={(event) => updateTable('functionName', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="生成包路径"><Input required maxLength={200} value={draft.table.packageName} onChange={(event) => updateTable('packageName', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="作者"><Input maxLength={50} value={draft.table.author || ''} onChange={(event) => updateTable('author', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="上级菜单"><InfrastructureSelect value={draft.table.parentMenuId == null ? '' : String(draft.table.parentMenuId)} options={menuOptions} onValueChange={(value) => updateTable('parentMenuId', value === '' ? null : Number(value))} /></InfrastructureField>
          {draft.table.tplCategory === 'TREE' && <>
            <InfrastructureField label="父级字段"><InfrastructureSelect value={draft.table.treeParentCode || ''} options={fieldOptions} onValueChange={(value) => updateTable('treeParentCode', value)} /></InfrastructureField>
            <InfrastructureField label="名称字段"><InfrastructureSelect value={draft.table.treeNameCode || ''} options={fieldOptions} onValueChange={(value) => updateTable('treeNameCode', value)} /></InfrastructureField>
          </>}
          {draft.table.tplCategory === 'SUB' && <>
            <InfrastructureField label="子表名称"><Input required value={draft.table.subTableName || ''} onChange={(event) => updateTable('subTableName', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="子表关联字段"><Input required value={draft.table.subTableFk || ''} onChange={(event) => updateTable('subTableFk', event.target.value)} /></InfrastructureField>
          </>}
          {([
            ['tenantFieldFlag', '包含租户字段'], ['logicDeleteFlag', '使用逻辑删除'], ['versionFieldFlag', '使用版本校验'],
          ] as const).map(([key, label]) => <InfrastructureField key={key} label={label}><Switch aria-label={label} checked={draft.table[key] === 1} onCheckedChange={(checked) => updateTable(key, checked ? 1 : 0)} /></InfrastructureField>)}
          <InfrastructureField label="备注" className="sm:col-span-2 lg:col-span-3"><Textarea rows={3} maxLength={500} value={draft.table.remark || ''} onChange={(event) => updateTable('remark', event.target.value)} /></InfrastructureField>
        </div> : <div className="overflow-x-auto">
          <datalist id="codegen-dict-options">{dictTypes.map((item) => <option key={item.dictType} value={item.dictType}>{item.dictName}</option>)}</datalist>
          <table className="w-full min-w-[1180px] text-sm">
            <thead><tr className="border-b text-left text-cf-subtle">{['数据库字段', '名称与代码字段', '代码类型', '参与范围', '查询方式', '控件与字典', '顺序'].map((heading) => <th className="px-3 py-3 font-medium" key={heading}>{heading}</th>)}</tr></thead>
            <tbody>{draft.columns.map((column) => <tr key={column.columnName} className="border-b last:border-0">
              <td className="px-3 py-3"><p className="font-mono text-xs text-cf-title">{column.columnName}</p><p className="mt-1 text-xs text-cf-subtle">{column.columnType}{column.pkFlag === 1 ? ' · 主键' : ''}{column.auditFieldFlag === 1 ? ' · 审计字段' : ''}</p></td>
              <td className="space-y-2 px-3 py-3"><Input aria-label={`${column.columnName}显示名称`} value={column.columnComment || ''} onChange={(event) => updateColumn(column.columnName, 'columnComment', event.target.value)} /><Input required aria-label={`${column.columnName}代码字段名`} value={column.javaField} onChange={(event) => updateColumn(column.columnName, 'javaField', event.target.value)} /></td>
              <td className="px-3 py-3"><InfrastructureSelect aria-label={`${column.columnName}代码类型`} value={column.javaType} options={values(options.javaTypes)} onValueChange={(value) => updateColumn(column.columnName, 'javaType', value)} /></td>
              <td className="px-3 py-3"><div className="grid grid-cols-2 gap-2">{columnFlags.map(([flag, label]) => <label key={flag} className="flex items-center gap-2 text-xs text-cf-muted"><input className={infrastructureCheckboxClassName} type="checkbox" checked={column[flag] === 1} aria-label={`${column.columnName}${label}`} onChange={(event) => updateColumn(column.columnName, flag, event.target.checked ? 1 : 0)} />{label}</label>)}</div></td>
              <td className="px-3 py-3"><InfrastructureSelect disabled={column.queryFlag !== 1} aria-label={`${column.columnName}查询方式`} value={column.queryType || 'EQ'} options={values(options.queryTypes)} onValueChange={(value) => updateColumn(column.columnName, 'queryType', value)} /></td>
              <td className="space-y-2 px-3 py-3"><InfrastructureSelect aria-label={`${column.columnName}控件类型`} value={column.htmlType || 'input'} options={values(options.htmlTypes)} onValueChange={(value) => updateColumn(column.columnName, 'htmlType', value)} /><Input list="codegen-dict-options" aria-label={`${column.columnName}字典类型`} placeholder="选择字典类型" value={column.dictType || ''} onChange={(event) => updateColumn(column.columnName, 'dictType', event.target.value || null)} /></td>
              <td className="w-24 px-3 py-3"><Input required aria-label={`${column.columnName}排序`} type="number" min={0} value={column.sortNo} onChange={(event) => updateColumn(column.columnName, 'sortNo', Number(event.target.value))} /></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </form>
    </BaseDialog>
  );
}
