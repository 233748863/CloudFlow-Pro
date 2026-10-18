import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { decimalAmount, formatDecimalAmount, groupAmountDigits } from '@/utils/amountValue';
import './common-primitives.css';

interface BaseAmountInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max'> {
  precision?: number;
  min?: number | string;
  max?: number | string;
  currency?: React.ReactNode;
}

export type AmountInputProps = BaseAmountInputProps & (
  | { stringMode: true; value: string | number | null | undefined; onValueChange: (value: string | null) => void }
  | { stringMode?: false; value: number | null | undefined; onValueChange: (value: number | null) => void }
);

const stringAmountMode = (props: AmountInputProps): props is Extract<AmountInputProps, { stringMode: true }> => props.stringMode === true;

const formatAmount = formatDecimalAmount;

const normalizeEditableAmount = (input: string, precision: number, allowNegative: boolean) => {
  const normalizedPunctuation = input.replace(/，/g, ',').replace(/。/g, '.');
  const negative = allowNegative && normalizedPunctuation.trimStart().startsWith('-');
  const unsigned = normalizedPunctuation.replace(/[^\d.]/g, '');
  const dotIndex = unsigned.indexOf('.');
  const hasDecimalPoint = precision > 0 && dotIndex >= 0;
  const integerSource = dotIndex >= 0 ? unsigned.slice(0, dotIndex) : unsigned;
  const fractionSource = dotIndex >= 0 ? unsigned.slice(dotIndex + 1) : '';
  const integerDigits = integerSource.replace(/^0+(?=\d)/, '') || (hasDecimalPoint ? '0' : '');
  const fractionDigits = fractionSource.slice(0, precision);
  const raw = `${negative ? '-' : ''}${integerDigits}${hasDecimalPoint ? `.${fractionDigits}` : ''}`;

  if (!integerDigits) {
    return { raw: negative ? '-' : '', display: negative ? '-' : '' };
  }

  const groupedInteger = groupAmountDigits(integerDigits);
  return {
    raw,
    display: `${negative ? '-' : ''}${groupedInteger}${hasDecimalPoint ? `.${fractionDigits}` : ''}`,
  };
};

const editableCharacterCount = (value: string) => Array.from(value).filter((character) => /[\d.-]/.test(character)).length;

const cursorPositionForCount = (value: string, targetCount: number) => {
  if (targetCount <= 0) return 0;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/[\d.-]/.test(value[index])) {
      count += 1;
    }
    if (count >= targetCount) {
      return index + 1;
    }
  }
  return value.length;
};

export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  (
    properties,
    forwardedRef,
  ) => {
    const {
      value,
      onValueChange,
      stringMode,
      precision = 2,
      min,
      max,
      currency,
      className,
      onBlur,
      onFocus,
      ...props
    } = properties;
    const safePrecision = Math.min(20, Math.max(0, Math.floor(precision)));
    const [displayValue, setDisplayValue] = useState(() => formatAmount(value, safePrecision));
    const inputRef = useRef<HTMLInputElement | null>(null);
    const focusedRef = useRef(false);
    const pendingCursorRef = useRef<number | null>(null);
    const outOfRange = useMemo(
      () => {
        const amount = decimalAmount(value);
        const minimum = decimalAmount(min);
        const maximum = decimalAmount(max);
        return amount !== null && ((minimum !== null && amount.lessThan(minimum)) || (maximum !== null && amount.greaterThan(maximum)));
      },
      [max, min, value],
    );

    useEffect(() => {
      if (!focusedRef.current) {
        setDisplayValue(formatAmount(value, safePrecision));
      }
    }, [safePrecision, value]);

    useLayoutEffect(() => {
      if (pendingCursorRef.current === null || !inputRef.current) {
        return;
      }
      inputRef.current.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
      pendingCursorRef.current = null;
    }, [displayValue]);

    const setRefs = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    return (
      <div className={cn('cf-amount-input-shell', currency && 'has-currency')}>
        {currency ? <span className="cf-amount-input-currency" aria-hidden="true">{currency}</span> : null}
        <input
          ref={setRefs}
          type="text"
          inputMode={safePrecision > 0 ? 'decimal' : 'numeric'}
          value={displayValue}
          aria-invalid={outOfRange || undefined}
          className={cn(
            'cf-control cf-amount-input h-9 min-h-9 w-full rounded-md px-3 py-1.5 text-[13px] tabular-nums',
            outOfRange && 'cf-control-invalid',
            className,
          )}
          onFocus={(event) => {
            focusedRef.current = true;
            onFocus?.(event);
          }}
          onBlur={(event) => {
            focusedRef.current = false;
            setDisplayValue(formatAmount(value, safePrecision));
            onBlur?.(event);
          }}
          onChange={(event) => {
            const selectionStart = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
            const charactersBeforeCursor = editableCharacterCount(event.currentTarget.value.slice(0, selectionStart));
            const normalized = normalizeEditableAmount(
              event.currentTarget.value,
              safePrecision,
              min === undefined || decimalAmount(min)?.isNegative() === true,
            );
            pendingCursorRef.current = cursorPositionForCount(normalized.display, charactersBeforeCursor);
            setDisplayValue(normalized.display);

            if (!normalized.raw || normalized.raw === '-' || normalized.raw === '.') {
              if (stringAmountMode(properties)) properties.onValueChange(null);
              else properties.onValueChange(null);
              return;
            }
            if (stringAmountMode(properties)) {
              properties.onValueChange(decimalAmount(normalized.raw) ? normalized.raw : null);
            } else {
              const parsed = Number(normalized.raw);
              properties.onValueChange(Number.isFinite(parsed) ? parsed : null);
            }
          }}
          {...props}
        />
      </div>
    );
  },
);

AmountInput.displayName = 'AmountInput';
