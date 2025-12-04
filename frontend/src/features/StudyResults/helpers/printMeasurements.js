import { buildAiMeasurementsProps } from "../components/AiMeasurements/buildAiMeasurementsProps";
import { buildMeasurementsReportHtml } from "../components/Report/buildMeasurementsReportHtml";
import { printMeasurementsReport } from "../components/Report/printMeasurementsReport";

async function toDataUrl(src) {
    try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

export async function printMeasurements({ panechoEchoprimeResults, patientName, studyUID }) {
    const { mainMeasurements = [], Measurements = [] } = buildAiMeasurementsProps(
        panechoEchoprimeResults || null
    ) || {};

    const hasAny = (Array.isArray(mainMeasurements) && mainMeasurements.length > 0) ||
        (Array.isArray(Measurements) && Measurements.some((g) => (g.items || []).length > 0));
    if (!hasAny) {
        return { ok: false, reason: "no_measurements" };
    }

    const logoDataUrl = await toDataUrl("/horalix-taskbar-app-icon.png");
    const html = buildMeasurementsReportHtml({ logoDataUrl, patientName, studyUID, mainMeasurements, Measurements });
    const preview = window.electronAPI?.report?.previewPdf;
    if (typeof preview === "function") {
        const res = await preview(html, { printBackground: true, pageSize: "A4" });
        if (!res?.ok) {
            return { ok: false, reason: "preview_failed", error: res?.error };
        }
        return { ok: true };
    }

    // fallback to browser print if no Electron API
    printMeasurementsReport({ patientName, studyUID, mainMeasurements, Measurements });
    return { ok: true };
}
