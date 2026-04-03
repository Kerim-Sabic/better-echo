import React, { useEffect, useMemo, useState } from 'react';
import { MeasurementItem } from '../../horalixAiResults.types';

function PenIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line
        x1="9.5"
        y1="3.5"
        x2="12.5"
        y2="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ResetIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 2V6H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 5.5C3.5 3 5.8 1.5 8.5 1.5C11.8 1.5 14.5 4.2 14.5 7.5C14.5 10.8 11.8 13.5 8.5 13.5C6.2 13.5 4.2 12.2 3.2 10.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = {
  title: string;
  items: MeasurementItem[];
  onRequestSaveStudyAnalysisOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearStudyAnalysisOverride?: (key: string) => void;
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
  onRequestSaveStudyAnalysisOverride,
  onRequestClearStudyAnalysisOverride,
}: {
  item: MeasurementItem;
  onRequestSaveStudyAnalysisOverride?: (
    key: string,
    override: { value?: number; label?: string }
  ) => void;
  onRequestClearStudyAnalysisOverride?: (key: string) => void;
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
    typeof onRequestSaveStudyAnalysisOverride === 'function';

  const canReset =
    Boolean(measurementKey) &&
    Boolean(item.isOverridden) &&
    typeof onRequestClearStudyAnalysisOverride === 'function';

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

      onRequestSaveStudyAnalysisOverride?.(measurementKey, {
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

    onRequestSaveStudyAnalysisOverride?.(measurementKey, {
      value: normalizedNumericValue,
    });
    setValidationError(null);
    setIsEditing(false);
  };

  const handleReset = () => {
    if (!canReset || !measurementKey) {
      return;
    }

    onRequestClearStudyAnalysisOverride?.(measurementKey);
    setValidationError(null);
    setIsEditing(false);
  };

  return (
    <div className="border-b border-[#1A2030] py-1 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 truncate text-[10px] leading-snug tracking-wide text-[#8D98B3]">
            {item.label || item.key || 'Measurement'}
          </div>

          {item.isOverridden && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Edited" />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 text-right">
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
                  className="inline-block cursor-help text-[10px] font-bold leading-none text-red-400"
                  title="Discrepancy, there is uncertainty about this measurement."
                >
                  !
                </span>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  title="Edit measurement"
                  className="ml-0.5 flex items-center justify-center rounded p-[2px] text-[#4B5975] transition hover:text-white"
                >
                  <PenIcon size={9} />
                </button>
              )}

              {canReset && (
                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset to original"
                  className="flex items-center justify-center rounded p-[2px] text-[#FCA5A5] transition hover:text-white"
                >
                  <ResetIcon size={9} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {validationError && (
        <div className="mt-0.5 text-[9px] text-red-300">
          {validationError}
        </div>
      )}

      {isEditing && canEdit && (
        <div className="mt-1.5 space-y-1.5 rounded border border-[#1F2937] bg-[#0E1420] p-1.5">
          {editType === 'label' ? (
            <select
              value={draftLabel}
              onChange={event => {
                setDraftLabel(event.target.value);
                setValidationError(null);
              }}
              className="w-full rounded border border-[#334155] bg-[#0B0F17] px-1.5 py-1 text-[11px] text-white outline-none focus:border-[#60A5FA]"
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
              className="w-full rounded border border-[#334155] bg-[#0B0F17] px-1.5 py-1 text-[11px] text-white outline-none focus:border-[#60A5FA]"
            />
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-[#1D4ED8] px-2 py-[3px] text-[9px] font-semibold text-white transition hover:bg-[#2563EB]"
            >
              Save
            </button>

            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded border border-[#334155] px-2 py-[3px] text-[9px] font-semibold text-[#8D98B3] transition hover:text-white"
            >
              Cancel
            </button>

            {canReset && (
              <button
                type="button"
                onClick={handleReset}
                className="ml-auto rounded border border-[#5B2333] px-2 py-[3px] text-[9px] font-semibold text-[#FCA5A5] transition hover:text-white"
              >
                Reset
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
  onRequestSaveStudyAnalysisOverride,
  onRequestClearStudyAnalysisOverride,
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
            onRequestSaveStudyAnalysisOverride={
              onRequestSaveStudyAnalysisOverride
            }
            onRequestClearStudyAnalysisOverride={
              onRequestClearStudyAnalysisOverride
            }
          />
        ))}
      </div>
    </section>
  );
}
