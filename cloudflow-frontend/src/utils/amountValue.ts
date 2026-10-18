import Decimal from 'decimal.js';

export const decimalAmount = (value: string | number | null | undefined): Decimal | null => {
  if (value === null || value === undefined || value === '') return null;
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && Math.abs(decimal.e) <= 128 && decimal.precision() <= 128 ? decimal : null;
  } catch {
    return null;
  }
};

export const groupAmountDigits = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const normalizeFormNumber = (value: string): number | string => {
  const amount = decimalAmount(value);
  const number = Number(value);
  return amount && Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER && amount.equals(String(number)) ? number : value;
};

export const formatDecimalAmount = (value: string | number | null | undefined, precision: number): string => {
  const amount = decimalAmount(value);
  if (!amount) return '';
  const [integer, fraction] = amount.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP).toFixed().split('.');
  return `${groupAmountDigits(integer)}${fraction ? `.${fraction}` : ''}`;
};
