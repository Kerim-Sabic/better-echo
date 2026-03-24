import React, { useEffect, useMemo, useState } from 'react';
import { MeasurementItem } from '../../horalixAiResults.types';

type Props = {
  title: string;
  items: MeasurementItem[];
  onRequestSavePanechoOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearPanechoOverride?: (key: string) => void;
};

function getDotColor(color?: string | null) {
  if (color === 'green') {
    return '#34d399';
  }

  if (color === 'yellow') {
    return '#fde047';
  }

  if (color === 'orange') {
    return '#fb923c';
  }

  if (color === 'red') {
    return '#f87171';
  }

  return '#94a3b8';
}

function formatDisplayValue(item: MeasurementItem) {
  if (item.displayValue === 0) {
    return '0';
  }

  if (item.displayValue) {
    return String(item.displayValue);
  }

  return '-';
}

function getInitialDraftValue(item: MeasurementItem) {
  if (typeof item.rawValue === 'number' && Number.isFinite(item.rawValue)) {
    return String(item.rawValue);
  }

  if (typeof item.displayValue === 'number' && Number.isFinite(item.displayValue)) {
    return String(item.displayValue);
  }

  if (typeof item.displayValue === 'string') {
    return item.displayValue.trim();
  }

  return '';
}

function getInitialDraftLabel(item: MeasurementItem) {
  if (typeof item.displayValue === 'string') {
    return item.displayValue.trim();
  }

  return '';
}

function MeasurementRow({
  item,
  onRequestSavePanechoOverride,
  onRequestClearPanechoOverride,
}: {
  item: MeasurementItem;
  onRequestSavePanechoOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearPanechoOverride?: (key: string) => void;
}) {
  const value = formatDisplayValue(item);
  const alreadyContainsUnits =
    Boolean(item.units) &&
    value.toLowerCase().includes(String(item.units).toLowerCase());

  const measurementKey = typeof item.key === 'string' ? item.key.trim() : '';
  const editType = item.editType === 'label' ? 'label' : 'value';
  const canEdit =
    Boolean(measurementKey) &&
    Boolean(item.editable) &&
    typeof onRequestSavePanechoOverride === 'function';

  const canReset =
    Boolean(measurementKey) &&
    Boolean(item.isOverridden) &&
    typeof onRequestClearPanechoOverride === 'function';

  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(getInitialDraftValue(item));
  const [draftLabel, setDraftLabel] = useState(getInitialDraftLabel(item));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraftValue(getInitialDraftValue(item));
    setDraftLabel(getInitialDraftLabel(item));
    setValidationError(null);
    setIsEditing(false);
  }, [
    item.displayValue,
    item.rawValue,
    item.isOverridden,
    item.editType,
    item.key,
  ]);

  const labelOptions = useMemo(() => {
    const options = Array.isArray(item.editOptions) ? item.editOptions : [];
    const normalizedOptions: string[] = [];

    options.forEach(option => {
      if (typeof option !== 'string') {
        return;
      }

      const trimmed = option.trim();
      if (!trimmed || normalizedOptions.includes(trimmed)) {
        return;
      }

      normalizedOptions.push(trimmed);
    });

    const currentLabel = getInitialDraftLabel(item);
    if (currentLabel && !normalizedOptions.includes(currentLabel)) {
      normalizedOptions.push(currentLabel);
    }

    return normalizedOptions;
  }, [item.editOptions, item.displayValue]);

  const handleStartEdit = () => {
    if (!canEdit) {
      return;
    }

    setDraftValue(getInitialDraftValue(item));
    setDraftLabel(getInitialDraftLabel(item));
    setValidationError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraftValue(getInitialDraftValue(item));
    setDraftLabel(getInitialDraftLabel(item));
    setValidationError(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!canEdit || !measurementKey) {
      return;
    }

    if (editType === 'label') {
      const normalizedLabel = draftLabel.trim();
      if (!normalizedLabel) {
        setValidationError('Select a value before saving.');
        return;
      }

      onRequestSavePanechoOverride?.(measurementKey, {
        label: normalizedLabel,
      });
      setValidationError(null);
      setIsEditing(false);
      return;
    }

    const normalizedNumericValue = Number(draftValue);
    if (!Number.isFinite(normalizedNumericValue)) {
      setValidationError('Enter a valid numeric value before saving.');
      return;
    }

    onRequestSavePanechoOverride?.(measurementKey, {
      value: normalizedNumericValue,
    });
    setValidationError(null);
    setIsEditing(false);
  };

  const handleReset = () => {
    if (!canReset || !measurementKey) {
      return;
    }

    onRequestClearPanechoOverride?.(measurementKey);
    setValidationError(null);
    setIsEditing(false);
  };

  return (
    <div className="border-b border-[#1A2030] py-1.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-[10px] leading-snug tracking-wide text-[#8D98B3] uppercase">
              {item.label || item.key || 'Measurement'}
            </div>

            {item.isOverridden && (
              <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                Edited
              </span>
            )}
          </div>

          {validationError && (
            <div className="mt-1 text-[10px] text-red-300">
              {validationError}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-right">
          {!isEditing && (
            <>
              <span className="text-[11px] font-semibold text-white">
                {value}
                {item.units && !alreadyContainsUnits ? ` ${item.units}` : ''}
              </span>

              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: getDotColor(item.color) }}
              />

              {item.discrepancy && (
                <span
                  className="inline-block cursor-help text-[11px] font-bold leading-none text-red-400"
                  title="Discrepancy, there is uncertainty about this measurement."
                  aria-label="Discrepancy, there is uncertainty about this measurement."
                >
                  !
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {(canEdit || canReset) && !isEditing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="rounded border border-[#334155] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#CBD5E1] transition hover:border-[#60A5FA] hover:text-white"
            >
              Edit
            </button>
          )}

          {canReset && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded border border-[#5B2333] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#FCA5A5] transition hover:border-[#EF4444] hover:text-white"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {isEditing && canEdit && (
        <div className="mt-2 space-y-2 rounded border border-[#1F2937] bg-[#0E1420] p-2">
          {editType === 'label' ? (
            <select
              value={draftLabel}
              onChange={event => {
                setDraftLabel(event.target.value);
                setValidationError(null);
              }}
              className="w-full rounded border border-[#334155] bg-[#0B0F17] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#60A5FA]"
            >
              <option value="">Select value</option>
              {labelOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              step="any"
              value={draftValue}
              onChange={event => {
                setDraftValue(event.target.value);
                setValidationError(null);
              }}
              className="w-full rounded border border-[#334155] bg-[#0B0F17] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#60A5FA]"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded border border-[#1D4ED8] bg-[#1D4ED8] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-[#2563EB]"
            >
              Save
            </button>

            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded border border-[#334155] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#CBD5E1] transition hover:border-[#60A5FA] hover:text-white"
            >
              Cancel
            </button>

            {canReset && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded border border-[#5B2333] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#FCA5A5] transition hover:border-[#EF4444] hover:text-white"
              >
                Reset Override
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SectionBox({
  title,
  items,
  onRequestSavePanechoOverride,
  onRequestClearPanechoOverride,
}: Props) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded border border-[#1A2030] bg-[#0B0F17]">
      <div className="bg-[#171C27] px-2 py-1 text-[10px] font-bold tracking-wide text-[#A0A9BE] uppercase">
        {title}
      </div>

      <div className="px-2 py-1">
        {items.map(item => (
          <MeasurementRow
            key={item.key || item.label}
            item={item}
            onRequestSavePanechoOverride={onRequestSavePanechoOverride}
            onRequestClearPanechoOverride={onRequestClearPanechoOverride}
          />
        ))}
      </div>
    </section>
  );
}
