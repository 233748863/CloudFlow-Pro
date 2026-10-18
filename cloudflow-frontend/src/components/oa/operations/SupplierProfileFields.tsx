import React from 'react';
import type { Supplier } from '@/services/api/purchase';
import { oaGet, type OaSupplierCategory } from '@/services/api/oaOperations';
import { useRemote } from './OperationsKit';
import { FormFields, optionsOf } from './RecordEditor';

export default function SupplierProfileFields({ value, onChange }: { value: Supplier; onChange: (value: Supplier) => void }) {
  const categories = useRemote(() => oaGet<OaSupplierCategory[]>('/supplier/categories'));
  return <div className="oa-operations space-y-4">{categories.error && <p role="alert">{categories.error}</p>}<FormFields value={value} onChange={onChange} fields={[
    { key: 'supplierCode', label: '供应商编号', maxLength: 50 }, { key: 'shortName', label: '简称', maxLength: 50 },
    { key: 'supplierType', label: '供应商类型', type: 'select', options: { MANUFACTURER: '制造商', DEALER: '经销商', SERVICE: '服务商', INDIVIDUAL: '个人' } },
    { key: 'categoryId', label: '供应商分类', type: 'select', numeric: true, options: optionsOf(categories.data?.filter(item => item.status === 'ACTIVE'), 'categoryId', 'categoryName') },
    { key: 'creditCode', label: '统一社会信用代码', maxLength: 18 }, { key: 'legalPerson', label: '法定代表人', maxLength: 50 },
    { key: 'registerCapital', label: '注册资本（元）', type: 'number', min: 0, max: 999999999999.99, step: 0.01 }, { key: 'registerDate', label: '注册日期', type: 'date' },
    { key: 'businessScope', label: '经营范围', type: 'textarea', wide: true }, { key: 'province', label: '省份', maxLength: 50 }, { key: 'city', label: '城市', maxLength: 50 },
    { key: 'address', label: '地址', wide: true, maxLength: 500 }, { key: 'contactEmail', label: '联系邮箱', maxLength: 100 }, { key: 'taxNo', label: '纳税人识别号', maxLength: 50 },
    { key: 'taxRate', label: '默认税率（0–1）', type: 'number', min: 0, max: 1, step: 0.0001 }, { key: 'currency', label: '默认币种', maxLength: 10 },
    { key: 'paymentTerms', label: '付款条件', maxLength: 500, wide: true }, { key: 'cooperationStartDate', label: '合作开始日期', type: 'date' }, { key: 'levelCode', label: '管理等级', maxLength: 50 },
    { key: 'preventPurchaseFlag', label: '禁止采购', type: 'checkbox' }, { key: 'preventRfqFlag', label: '禁止询价', type: 'checkbox' },
  ]} /></div>;
}
