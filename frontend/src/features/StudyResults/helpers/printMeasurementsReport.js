import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MeasurementsReport from "../components/Report/MeasurementsReport";

export function printMeasurementsReport({ patientName, studyUID, mainMeasurements, Measurements }) {
    try {
        const body = renderToStaticMarkup(
            <MeasurementsReport
                patientName={patientName}
                studyUID={studyUID}
                mainMeasurements={mainMeasurements}
                Measurements={Measurements}
            />
        );

        const styles = `
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; }
      .page { width: 210mm; min-height: 297mm; padding: 16mm; margin: 0 auto; background: #ffffff; }
      .report-root { }
      .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 16px; }
      .brand .title { font-size: 20px; font-weight: 700; }
      .brand .meta { font-size: 12px; color: #6b7280; margin-top: 2px; }
      .identity { font-size: 12px; color: #374151; text-align: right; }
      .section { margin-top: 16px; }
      .section h2 { font-size: 16px; margin: 0 0 8px; }
      .group { margin-top: 12px; }
      .group-title { font-size: 14px; margin: 0 0 6px; color: #374151; }
      .table { width: 100%; border-collapse: collapse; }
      .table th, .table td { border: 1px solid #e5e7eb; padding: 6px 8px; font-size: 12px; }
      .table th { background: #f9fafb; text-align: left; }
      @media print { body { background: #ffffff; } .page { box-shadow: none; } }
    `;

        const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>AI Measurements Report</title>
          <style>${styles}</style>
        </head>
        <body>
          <div class="page">${body}</div>
        </body>
      </html>`;

        const win = window.open("", "_blank");
        if (!win) return;
        win.document.open();
        win.document.write(html);
        win.document.close();
        const doPrint = () => {
            try { win.focus(); } catch {}
            try { win.print(); } catch {}
        };
        if (win.document.readyState === "complete") {
            setTimeout(doPrint, 50);
        } else {
            win.onload = () => setTimeout(doPrint, 50);
        }
    } catch (e) {
        console.warn("Print failed", e);
    }
}
