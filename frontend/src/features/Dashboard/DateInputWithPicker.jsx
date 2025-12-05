import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";

function isoToDmy(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
}

function isValidDateParts(dd, mm, yyyy) {
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    if (!d || !m || !y) return false;
    const date = new Date(y, m - 1, d);
    return (
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d
    );
}

function dmyToIso(dmy) {
    if (!dmy || dmy.length < 10) return "";
    const [dd, mm, yyyy] = dmy.split("-");
    if (!/^\d{2}$/.test(dd) || !/^\d{2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) return "";
    if (!isValidDateParts(dd, mm, yyyy)) return "";
    return `${yyyy}-${mm}-${dd}`;
}

export default function DateInputWithPicker({ id, value, onChange, label, required }) {
    const [text, setText] = useState(isoToDmy(value));

    // Keep local text in sync with prop value
    useEffect(() => {
        const next = isoToDmy(value);
        if (next !== text) setText(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const onTextChange = (e) => {
        const raw = e.target.value || "";
        // keep only digits
        const digits = raw.replace(/\D/g, "").slice(0, 8);
        // auto-insert dashes DD-MM-YYYY
        let pretty = digits;
        if (digits.length > 4) pretty = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
        else if (digits.length > 2) pretty = `${digits.slice(0, 2)}-${digits.slice(2)}`;
        setText(pretty);

        const iso = dmyToIso(pretty);
        if (iso && onChange) onChange(iso);
        if (!digits && onChange) onChange("");
    };

    const onNativeChange = (e) => {
        const v = e.target.value; // YYYY-MM-DD
        if (!v) {
            setText("");
            onChange?.("");
            return;
        }
        const [yyyy, mm, dd] = v.split("-");
        setText(`${dd}-${mm}-${yyyy}`);
        onChange?.(v);
    };

    // Convert current value to native date value (YYYY-MM-DD)
    const nativeValue = useMemo(() => {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
        return value;
    }, [value]);

    return (
        <div className="grid gap-1">
            {label && (
                <label htmlFor={id} className="text-sm text-muted-foreground">
                    {label} {required ? <span className="text-red-500">*</span> : null}
                </label>
            )}
            <div className="relative">
                <Input
                    id={id}
                    placeholder="DD-MM-YYYY"
                    value={text}
                    onChange={onTextChange}
                    inputMode="numeric"
                    className="pr-12"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md h-9 w-10"
                    aria-label="Open date picker"
                    tabIndex={-1}
                >
                    <CalendarIcon className="w-4 h-4" />
                </Button>
                {/* Overlay native date input to anchor the picker at the calendar icon */}
                <input
                    type="date"
                    value={nativeValue}
                    onChange={onNativeChange}
                    aria-label="Pick date"
                    className="absolute right-1 top-1/2 -translate-y-1/2 transform w-12 h-12 opacity-0 z-10 cursor-pointer rounded-md"
                />
            </div>
        </div>
    );
}
