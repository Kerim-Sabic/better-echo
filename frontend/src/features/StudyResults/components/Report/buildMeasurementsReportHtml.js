import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MeasurementsReport from "./MeasurementsReport";

export function buildMeasurementsReportHtml({
  logoDataUrl,
  patientName,
  studyUID,
  mainMeasurements = [],
  Measurements = [],
}) {
  const brandHeader = (
    <div className="brand-header">
      <div className="left">
        {logoDataUrl ? <img className="logo" src={logoDataUrl} alt="Horalix Logo" /> : null}
        <div className="titles">
          <div className="title gradient">Study Results</div>
          <div className="subtitle">AI Measurements Report</div>
        </div>
      </div>
      <div className="right">
        <div>Patient: {patientName || '-'}</div>
        <div>UID: {studyUID || '-'}</div>
      </div>
    </div>
  );

  const report = (
    <div className="page">
      {brandHeader}
      <MeasurementsReport
        patientName={patientName}
        studyUID={studyUID}
        mainMeasurements={mainMeasurements}
        Measurements={Measurements}
        showHeader={false}
      />
    </div>
  );

  const body = renderToStaticMarkup(report);

  const styles = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; background: #ffffff; }
    .page { width: 210mm; min-height: 297mm; padding: 16mm; margin: 0 auto; background: #ffffff; }
    /* Brand header */
    .brand-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 12px; }
    .brand-header .left { display: flex; align-items: center; gap: 12px; }
    .brand-header .logo { width: 36px; height: 36px; }
    .brand-header .titles { display: flex; flex-direction: column; }
    .brand-header .title { font-size: 20px; font-weight: 800; line-height: 1.1; }
    .brand-header .subtitle { font-size: 12px; color: #6b7280; }
    .brand-header .right { text-align: right; font-size: 12px; color: #374151; }
    .gradient { background: linear-gradient(90deg, #9333EA 0%, #6366F1 50%, #06B6D4 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
    /* MeasurementsReport base styles (tables) */
    .report-root { }
    .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 10px; }
    .report-header .brand .title { font-size: 18px; font-weight: 700; }
    .report-header .brand .meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .report-header .identity { font-size: 11px; color: #374151; text-align: right; }
    .section { margin-top: 14px; }
    .section h2 { font-size: 15px; margin: 0 0 6px; }
    .group { margin-top: 10px; }
    .group-title { font-size: 13px; margin: 0 0 4px; color: #374151; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { border: 1px solid #e5e7eb; padding: 6px 8px; font-size: 12px; }
    .table th { background: #f9fafb; text-align: left; }
    @media print { body { background: #ffffff; } .page { box-shadow: none; } }
  `;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>AI Measurements Report</title>
      <style>${styles}</style>
    </head>
    <body>${body}</body>
  </html>`;
}
