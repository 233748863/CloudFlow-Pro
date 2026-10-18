import React, { useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { addAsset, updateAsset, getAssetCategories, type Asset } from '@/services/api/admin';
import type { OaAssetCategory } from '@/services/api/oaOperations';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { FormFields, optionsOf, depreciationMethods, type FieldSpec } from '@/components/oa/operations/RecordEditor';
import { useRemote } from '@/components/oa/operations/OperationsKit';
import { decimalAmount, normalizeFormNumber } from '@/utils/amountValue';

const defaultFields = ['depreciationMethod', 'usefulLifeMonths', 'salvageValue', 'maintenanceRequiredFlag'] as const;
type DefaultField = typeof defaultFields[number];
const emptyAsset = (): Asset => ({ name: '', assetCode: '', purchaseAmount: 0, depreciationFlag: 0, depreciationFrequency: 'MONTHLY', openingAccumulatedDepreciation: 0, insuranceReminderDays: 30 });
const applyCategoryDefaults = (asset: Asset, category: OaAssetCategory | undefined, overridden: Set<DefaultField>): Asset => {
  if (!category || category.status !== 'ACTIVE') return asset;
  const amount = decimalAmount(asset.purchaseAmount);
  const rate = decimalAmount(category.defaultSalvageRate ?? 0);
  return {
    ...asset,
    ...(!overridden.has('depreciationMethod') ? { depreciationMethod: category.defaultDepreciationMethod || 'STRAIGHT_LINE' } : {}),
    ...(!overridden.has('usefulLifeMonths') ? { usefulLifeMonths: category.defaultUsefulLifeMonths } : {}),
    ...(!overridden.has('salvageValue') ? { salvageValue: amount && rate ? normalizeFormNumber(amount.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)) : undefined } : {}),
    ...(!overridden.has('maintenanceRequiredFlag') ? { maintenanceRequiredFlag: category.maintenanceRequiredFlag ?? 0 } : {}),
  };
};

interface AssetFormProps { initialData?: Asset | null; formId?: string; onSuccess: () => void; onSubmittingChange?: (submitting: boolean) => void }
const AssetForm: React.FC<AssetFormProps> = ({ initialData, formId, onSuccess, onSubmittingChange }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Asset>(initialData || emptyAsset());
  const overridden = useRef(new Set<DefaultField>());
  const categories = useRemote(getAssetCategories);
  useEffect(() => { overridden.current.clear(); setFormData(initialData || emptyAsset()); }, [initialData]);
  useEffect(() => {
    if (initialData?.assetId || !categories.data) return;
    setFormData(current => applyCategoryDefaults(current, categories.data?.find(item => item.categoryId === current.categoryId), overridden.current));
  }, [categories.data, initialData?.assetId]);
  const change = (next: Asset) => {
    if (initialData?.assetId) { setFormData(next); return; }
    for (const key of defaultFields) if (!Object.is(formData[key], next[key])) overridden.current.add(key);
    setFormData(applyCategoryDefaults(next, categories.data?.find(item => item.categoryId === next.categoryId), overridden.current));
  };
  const fields: FieldSpec<Asset>[] = [
    { key: 'name', label: '资产名称', required: true, maxLength: 100 }, { key: 'assetCode', label: '资产编码', required: true, maxLength: 50 },
    { key: 'categoryId', label: '资产分类', type: 'select', numeric: true, required: true, options: optionsOf(categories.data?.filter(item => item.status === 'ACTIVE' || item.categoryId === initialData?.categoryId).map(item => ({ ...item, categoryName: item.categoryName + (item.status === 'ACTIVE' ? '' : '（已停用）') })), 'categoryId', 'categoryName') },
    { key: 'model', label: '规格型号' }, { key: 'purchaseAmount', label: '购入金额（元）', type: 'number', min: 0, max: 99999999.99, step: 0.01, required: true },
    { key: 'purchaseDate', label: '购入日期', type: 'date' }, { key: 'location', label: '存放位置' }, { key: 'locationDetail', label: '详细位置' },
    { key: 'depreciationFlag', label: '启用折旧', type: 'checkbox' }, { key: 'maintenanceRequiredFlag', label: '需要定期维保', type: 'checkbox' },
    { key: 'depreciationMethod', label: '折旧方法', type: 'select', options: depreciationMethods },
    { key: 'depreciationFrequency', label: '折旧频率', type: 'select', options: { MONTHLY: '每月', QUARTERLY: '每季', YEARLY: '每年' } },
    { key: 'usefulLifeMonths', label: '使用寿命（月）', type: 'number', min: 1, max: 1200, step: 1 },
    { key: 'availableFromDate', label: '可使用日期', type: 'date', required: formData.depreciationFlag === 1 },
    { key: 'salvageValue', label: '预计残值（元）', type: 'number', min: 0, max: 99999999.99, step: 0.01 },
    { key: 'openingAccumulatedDepreciation', label: '期初累计折旧（元）', type: 'number', min: 0, max: 99999999.99, step: 0.01 },
    { key: 'insurancePolicyNo', label: '保险单号', maxLength: 100 }, { key: 'insurerName', label: '保险公司', maxLength: 100 },
    { key: 'insuredValue', label: '保险金额（元）', type: 'number', min: 0, max: 99999999.99, step: 0.01 },
    { key: 'insuranceStartDate', label: '保险开始日期', type: 'date' }, { key: 'insuranceEndDate', label: '保险结束日期', type: 'date' },
    { key: 'insuranceReminderDays', label: '保险提前提醒天数', type: 'number', min: 0, step: 1 }, { key: 'warrantyExpireDate', label: '保修到期日期', type: 'date' },
    { key: 'remark', label: '备注', type: 'textarea', wide: true },
  ];
  return <form id={formId} className="oa-operations space-y-4" onSubmit={async event => {
    event.preventDefault(); if (loading) return; setLoading(true); onSubmittingChange?.(true);
    try { await (formData.assetId ? updateAsset(formData) : addAsset(formData)); toast.success('资产已保存'); onSuccess(); }
    catch (failure) { toast.error(getErrorMessage(failure, '保存资产失败')); }
    finally { setLoading(false); onSubmittingChange?.(false); }
  }}>
    {categories.error && <p role="alert">{categories.error}</p>}
    <p className="oa-ops-warning">已过账折旧保留历史金额；资本化和延长寿命请通过维修单办理。资产状态与保管人通过领用、归还和调拨更新。</p>
    {!initialData?.assetId && <p className="text-sm text-cf-muted">选择分类后自动带入折旧方法、寿命和残值；手动修改的值会保留。</p>}
    <FormFields value={formData} onChange={change} fields={fields} disabled={loading} />
  </form>;
};
export default AssetForm;
