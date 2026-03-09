import { Button } from "../../../../general_components/ui/button";

export function Footer({ rangeMode, setRangeMode, onClear }) {
    return (
        <div className="flex items-center justify-between border-t border-gray-100 p-3 px-3 pb-3 bg-white/50">
            <div className="flex items-center gap-2">
                {/* Made label clickable together with toggle */}
                <label 
                    className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer select-none"
                    onClick={() => setRangeMode((v) => !v)}
                >
                    <span>Range</span>
                    <div className={`toggle ${rangeMode ? "toggle-on" : ""} scale-75 origin-left`}>
                        <span className="toggle-thumb" />
                    </div>
                </label>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={onClear}
                    className="h-7 text-xs px-2 hover:bg-red-50 hover:text-red-600 text-muted-foreground ml-4"
                >
                    Clear
                </Button>
            </div>
        </div>
    );
}

export default Footer;
