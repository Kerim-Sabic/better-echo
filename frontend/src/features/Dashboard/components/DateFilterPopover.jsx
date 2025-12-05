import { useRef, useState } from "react";
import { Calendar, X } from "lucide-react";
import DatePicker, { DateObject } from "react-multi-date-picker";
import Footer from "./Footer";
import "react-multi-date-picker/styles/layouts/prime.css";
import "react-multi-date-picker/styles/colors/teal.css";

/**
 * Custom sidebar plugin for DatePicker.
 * Displays selected dates/ranges from the parent state.
 */
const CustomDatePanel = ({ dateFilters, onRemove }) => {
    // Helper to format YYYY-MM-DD to DD-MM-YYYY
    const formatDisplay = (isoString) => {
        if (!isoString) return "";
        const [y, m, d] = isoString.split("-");
        return `${d}-${m}-${y}`;
    };

    return (
        <div
            className="rmdp-panel"
            style={{
                display: "grid",
                gridTemplateRows: "auto 1fr",
                borderLeft: "1px solid #e5e7eb",
                minWidth: "140px"
            }}
        >
            <div style={{ padding: "10px", fontWeight: "bold", fontSize: "14px", color: "#374151" }}>
                Selected
            </div>

            <div style={{ padding: "0 10px 10px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "5px" }}>
                {dateFilters && dateFilters.length > 0 ? (
                    dateFilters.map((filter, index) => {
                        let label = "";
                        const fromStr = formatDisplay(filter.from);
                        const toStr = formatDisplay(filter.to);

                        // If it's a single date (from == to), or 'to' is missing
                        if (!filter.to || filter.from === filter.to) {
                            label = fromStr;
                        } else {
                            label = `${fromStr} - ${toStr}`;
                        }

                        return (
                            <div
                                key={index}
                                className="bg-teal-600 text-white text-xs rounded px-2 py-1.5 flex items-center justify-between shadow-sm"
                                style={{ backgroundColor: "#009688", marginBottom: "5px" }}
                            >
                                <span className="whitespace-nowrap">{label}</span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
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
                    <div className="text-xs text-gray-400 italic text-center mt-4">
                        No dates selected
                    </div>
                )}
            </div>
        </div>
    );
};

export default function DateFilterPopover({ dateFilters, setDateFilters }) {
    const [rangeMode, setRangeMode] = useState(false);
    const datePickerRef = useRef();

    // Helper: Convert ISO string to DateObject
    const toDateObj = (isoString) => {
        if (!isoString) return null;
        return new DateObject({ date: isoString, format: "YYYY-MM-DD" });
    };

    // 1. App State -> Picker Value
    // FIX: Always return arrays [start, end] so the picker (which is always in range mode) 
    // renders them correctly as closed ranges.
    const getPickerValue = () => {
        if (!dateFilters) return [];

        return dateFilters.map(f => {
            const start = toDateObj(f.from);
            
            // If 'to' is missing (selection in progress), pass [start]
            if (!f.to) return [start];
            
            // If it's a "single date" in our data (from == to), pass [start, start]
            // This forces the picker to see it as a "closed" range of 1 day.
            if (f.from === f.to) {
                const sameEnd = toDateObj(f.to);
                return [start, sameEnd];
            }

            // Real range
            return [start, toDateObj(f.to)];
        });
    };

    // 2. Picker Value -> App State
    const handleDateChange = (dateObjects) => {
        if (!dateObjects) {
            setDateFilters([]);
            return;
        }

        const values = Array.isArray(dateObjects) ? dateObjects : [dateObjects];

        const newFilters = values.map(val => {
            if (!val) return null;
            
            // Since we enforce range={true}, 'val' will ALWAYS be an array: [start] or [start, end]
            if (Array.isArray(val)) {
                const [start, end] = val;

                // SCENARIO 1: We have a start date, but no end date yet.
                if (start && !end) {
                    // Logic: If user is in "Single Mode" (rangeMode off), 
                    // we AUTO-COMPLETE this into a single date immediately.
                    if (!rangeMode) {
                        return {
                            from: start.format("YYYY-MM-DD"),
                            to: start.format("YYYY-MM-DD") // Force close
                        };
                    }
                    // If in "Range Mode", we leave 'to' null and wait for the second click.
                    return {
                        from: start.format("YYYY-MM-DD"),
                        to: null
                    };
                }

                // SCENARIO 2: We have both start and end.
                return {
                    from: start.format("YYYY-MM-DD"),
                    to: end.format("YYYY-MM-DD")
                };
            }
            
            // Fallback (shouldn't happen with range={true})
            return null;
        }).filter(Boolean);

        setDateFilters(newFilters);
    };

    const handleRemove = (index) => {
        const newFilters = [...dateFilters];
        newFilters.splice(index, 1);
        setDateFilters(newFilters);
    };

    return (
        <DatePicker
            ref={datePickerRef}
            value={getPickerValue()}
            onChange={handleDateChange}
            range={true} // FIX: ALWAYS keep library in range mode to preserve mixed data
            rangeHover={rangeMode} // Only show the range hover effect if logic is in Range Mode
            multiple={true}
            numberOfMonths={1}
            format="DD-MM-YYYY"
            className="teal"
            arrow={false}
            plugins={[
                <CustomDatePanel 
                    position="right" 
                    dateFilters={dateFilters} 
                    onRemove={handleRemove}
                />
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
            <Footer
                rangeMode={rangeMode}
                setRangeMode={(newMode) => {
                    setRangeMode(newMode);
                    // No need to clear filters anymore; mixed mode is supported.
                }}
                onClear={() => setDateFilters([])}
                onApply={() => datePickerRef.current?.closeCalendar()}
            />
        </DatePicker>
    );
}