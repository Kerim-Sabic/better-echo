const THEME_KEY = "horalix-theme";

export function getStoredTheme() {
    if (typeof window === "undefined") return "light";
    try {
        return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch (err) {
        return "light";
    }
}

export function applyTheme(theme) {
    if (typeof document === "undefined") return;
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nextTheme);
}

export function setStoredTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    try {
        localStorage.setItem(THEME_KEY, nextTheme);
    } catch (err) {}
    applyTheme(nextTheme);
    return nextTheme;
}

export function initTheme() {
    const theme = getStoredTheme();
    applyTheme(theme);
    return theme;
}
