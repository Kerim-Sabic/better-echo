import { useRef, useState } from "react";
import { Calendar, X } from "lucide-react";
import DatePicker, { DateObject } from "react-multi-date-picker";
import Footer from "./Footer";
import "react-multi-date-picker/styles/layouts/prime.css";
import "react-multi-date-picker/styles/colors/teal.css";

/**
 * Sidebar component for displaying selected dates.
 * Handles display formatting and item removal.
 */
const CustomDatePanel = ({ dateFilters, onRemove }) => {
    // 1 Helper to format ISO strings to DD-MM-YYYY
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
                borderLeft: "1px solid var(--border)",
                minWidth: "140px",
            }}
        >
            <div className="rmdp-panel-title">
                Selected
            </div>

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
                    msOverflowStyle: "none" 
                }}
            >
                {dateFilters && dateFilters.length > 0 ? (
                    dateFilters.map((filter, index) => {
                        let label = "";
                        const fromStr = formatDisplay(filter.from);
                        const toStr = formatDisplay(filter.to);

                        // 2 Determine display label
                        // 2.1 Single date or pending selection -> show 'from' only
                        if (!filter.to || filter.from === filter.to) {
                            label = fromStr;
                        } else {
                            // 2.2 Complete range -> show 'from - to'
                            label = `${fromStr} - ${toStr}`;
                        }

                        return (
                            <div
                                key={index}
                                className="bg-accent-main text-primary-foreground text-xs rounded px-2 py-1.5 flex items-center justify-between shadow-sm"
                                style={{ marginBottom: "5px" }}
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

    // 1 Helper: ISO string -> DateObject
    const toDateObj = (isoString) => {
        if (!isoString) return null;
        return new DateObject({ date: isoString, format: "YYYY-MM-DD" });
    };

    // 2 Transform App State -> Picker Value
    // Forces all values into array format to maintain compatibility with range={true}
    const getPickerValue = () => {
        if (!dateFilters) return [];

        return dateFilters.map(f => {
            const start = toDateObj(f.from);
            
            // 2.1 Pending selection (only start exists)
            if (!f.to) return [start];
            
            // 2.2 Single date (start == end) -> Send as closed range [start, start]
            if (f.from === f.to) {
                const sameEnd = toDateObj(f.to);
                return [start, sameEnd];
            }

            // 2.3 Real range -> Send as [start, end]
            return [start, toDateObj(f.to)];
        });
    };

    // 3 Handle Date Selection
    const handleDateChange = (dateObjects) => {
        if (!dateObjects) {
            setDateFilters([]);
            return;
        }

        const values = Array.isArray(dateObjects) ? dateObjects : [dateObjects];

        // 4 Range Mode Logic
        // Allows library to handle start/end selection naturally
        if (rangeMode) {
            const normalized = values.map(val => {
                if (!val) return null;
                if (Array.isArray(val)) {
                    const [start, end] = val;
                    // 4.1 Wait for second click (end) before finalizing
                    if (start && !end) return { from: start.format("YYYY-MM-DD"), to: null };
                    return { from: start.format("YYYY-MM-DD"), to: end.format("YYYY-MM-DD") };
                }
                return null;
            }).filter(Boolean);
            
            setDateFilters(normalized);
            return;
        }

        // 5 Single Mode Logic (Proactive Toggle)
        // 5.1 Identify the clicked item (last in array)
        const lastClicked = values[values.length - 1];
        if (!lastClicked) return;

        // 5.2 Format clicked item to ISO string
        const clickedStart = Array.isArray(lastClicked) ? lastClicked[0] : lastClicked;
        const dateStr = clickedStart.format("YYYY-MM-DD");

        // 5.3 Check if date exists in current state
        const existsIndex = dateFilters.findIndex(f => f.from === dateStr && f.to === dateStr);

        let nextFilters = [...dateFilters];

        if (existsIndex !== -1) {
            // 5.4 Exists -> Remove (Toggle Off)
            nextFilters.splice(existsIndex, 1);
        } else {
            // 5.5 New -> Add (Toggle On)
            nextFilters.push({ from: dateStr, to: dateStr });
        }

        // 5.6 Update state
        setDateFilters(nextFilters);
    };

    // 6 Remove specific filter via Sidebar
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
            range={true} 
            rangeHover={rangeMode}
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
                setRangeMode={(newMode) => setRangeMode(newMode)}
                onClear={() => setDateFilters([])}
            />
        </DatePicker>
    );
}
