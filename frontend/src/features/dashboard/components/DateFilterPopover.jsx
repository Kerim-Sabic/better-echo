import React, { useRef, useState } from "react";
import { Calendar, X } from "lucide-react";
import DatePicker, { DateObject } from "react-multi-date-picker";
import DateFilterFooter from "@/features/dashboard/components/DateFilterFooter";
import "react-multi-date-picker/styles/layouts/prime.css";
import "react-multi-date-picker/styles/colors/teal.css";

function formatIsoToHuman(isoDateString) {
  if (!isoDateString || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateString)) {
    return "";
  }

  const [year, month, day] = isoDateString.split("-");
  return `${day}-${month}-${year}`;
}

function CustomDatePanel({ dateFilters, onRemove }) {
  return (
    <div
      className="rmdp-panel"
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        borderLeft: "1px solid var(--border)",
        minWidth: "140px",
      }}
    >
      <div className="rmdp-panel-title">Selected</div>

      <div
        style={{
          padding: "0 10px 10px 10px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          maxHeight: "260px",
          maskImage: "linear-gradient(to bottom, black 85%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 85%, transparent 100%)",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {Array.isArray(dateFilters) && dateFilters.length > 0 ? (
          dateFilters.map((filter, index) => {
            const fromLabel = formatIsoToHuman(filter?.from);
            const toLabel = formatIsoToHuman(filter?.to);

            const displayLabel =
              !filter?.to || filter?.from === filter?.to
                ? fromLabel
                : `${fromLabel} - ${toLabel}`;

            return (
              <div
                key={`${filter?.from}-${filter?.to}-${index}`}
                className="bg-accent-main text-primary-foreground text-xs rounded px-2 py-1.5 flex items-center justify-between shadow-sm"
                style={{ marginBottom: "5px" }}
              >
                <span className="whitespace-nowrap">{displayLabel}</span>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    onRemove(index);
                  }}
                  className="ml-2 hover:bg-white/20 rounded p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-gray-400 italic text-center mt-4">No dates selected</div>
        )}
      </div>
    </div>
  );
}

export default function DateFilterPopover({ dateFilters, setDateFilters }) {
  const [rangeMode, setRangeMode] = useState(false);
  const datePickerRef = useRef(null);

  const toDateObject = isoDateString => {
    if (!isoDateString) return null;
    return new DateObject({ date: isoDateString, format: "YYYY-MM-DD" });
  };

  const getPickerValue = () => {
    if (!Array.isArray(dateFilters)) {
      return [];
    }

    return dateFilters
      .map(filter => {
        const startDate = toDateObject(filter?.from);
        if (!startDate) return null;

        if (!filter?.to) return [startDate];
        if (filter.from === filter.to) return [startDate, toDateObject(filter.to)];

        return [startDate, toDateObject(filter.to)];
      })
      .filter(Boolean);
  };

  const handleDateChange = selectedDateObjects => {
    if (!selectedDateObjects) {
      setDateFilters([]);
      return;
    }

    const selectedValues = Array.isArray(selectedDateObjects)
      ? selectedDateObjects
      : [selectedDateObjects];

    if (rangeMode) {
      const normalizedFilters = selectedValues
        .map(value => {
          if (!value) return null;
          if (!Array.isArray(value)) return null;

          const [startDate, endDate] = value;
          if (!startDate) return null;

          if (!endDate) {
            return { from: startDate.format("YYYY-MM-DD"), to: null };
          }

          return {
            from: startDate.format("YYYY-MM-DD"),
            to: endDate.format("YYYY-MM-DD"),
          };
        })
        .filter(Boolean);

      setDateFilters(normalizedFilters);
      return;
    }

    const lastSelectedValue = selectedValues[selectedValues.length - 1];
    if (!lastSelectedValue) return;

    const clickedDateObject = Array.isArray(lastSelectedValue) ? lastSelectedValue[0] : lastSelectedValue;
    if (!clickedDateObject) return;

    const clickedDateKey = clickedDateObject.format("YYYY-MM-DD");

    const existingDateIndex = dateFilters.findIndex(
      filter => filter?.from === clickedDateKey && filter?.to === clickedDateKey
    );

    const nextFilters = [...dateFilters];

    if (existingDateIndex !== -1) {
      nextFilters.splice(existingDateIndex, 1);
    } else {
      nextFilters.push({ from: clickedDateKey, to: clickedDateKey });
    }

    setDateFilters(nextFilters);
  };

  const handleRemoveFilter = index => {
    const nextFilters = [...dateFilters];
    nextFilters.splice(index, 1);
    setDateFilters(nextFilters);
  };

  return (
    <DatePicker
      ref={datePickerRef}
      value={getPickerValue()}
      onChange={handleDateChange}
      range
      rangeHover={rangeMode}
      multiple
      numberOfMonths={1}
      format="DD-MM-YYYY"
      className="teal"
      arrow={false}
      plugins={[
        <CustomDatePanel
          key="custom-date-panel"
          position="right"
          dateFilters={dateFilters}
          onRemove={handleRemoveFilter}
        />,
      ]}
      render={(value, openCalendar) => (
        <button
          type="button"
          onClick={openCalendar}
          className="text-muted-foreground hover:text-foreground fast-transition h-10 w-10 flex items-center justify-center rounded-md"
          aria-label="Filter by date"
        >
          <Calendar className="w-5 h-5" />
        </button>
      )}
    >
      <DateFilterFooter
        rangeMode={rangeMode}
        setRangeMode={setRangeMode}
        onClear={() => setDateFilters([])}
      />
    </DatePicker>
  );
}
