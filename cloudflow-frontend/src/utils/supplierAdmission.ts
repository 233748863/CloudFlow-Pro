import { format } from 'date-fns';
import type { SysSupplier } from '@/services/api/oaOperations';

type SupplierAdmission = Pick<SysSupplier, 'blacklistFlag' | 'bypassFlag' | 'bypassExpireDate'>;

export const hasSupplierBypass = (supplier: SupplierAdmission, date = format(new Date(), 'yyyy-MM-dd')) =>
  supplier.bypassFlag === 1 && !!supplier.bypassExpireDate
  && /^\d{4}-\d{2}-\d{2}$/.test(supplier.bypassExpireDate) && supplier.bypassExpireDate >= date;

export const isSupplierBlacklistBlocked = (supplier: SupplierAdmission) =>
  supplier.blacklistFlag === 1 && !hasSupplierBypass(supplier);

export const supplierBlacklistNotice = (supplier: SupplierAdmission) => supplier.blacklistFlag !== 1 ? ''
  : hasSupplierBypass(supplier) ? '黑名单 · 已批准例外至 ' + supplier.bypassExpireDate : '黑名单 · 禁止选择';
