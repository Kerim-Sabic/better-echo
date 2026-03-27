const PRINT_STYLES = `
  :root {
    color-scheme: light;
    --brand: #13254a;
    --brand-accent: #3160a6;
    --ink: #1f2937;
    --muted: #64748b;
    --border: #d7dee8;
    --panel: #f5f7fa;
    --success-bg: #e7f5ee;
    --success-text: #1f775c;
    --warning-bg: #fff5df;
    --warning-text: #9a6c12;
    --danger-bg: #fdebe6;
    --danger-text: #a74c37;
    --neutral-bg: #eef3f8;
    --neutral-text: #52637b;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #edf2f7;
    color: var(--ink);
    font-family: Arial, Helvetica, sans-serif;
  }

  body {
    padding: 24px;
  }

  .document-shell {
    max-width: 920px;
    margin: 0 auto;
    background: #ffffff;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
  }

  .document-header {
    background: var(--brand);
    color: #ffffff;
    padding: 28px 36px 24px;
  }

  .document-header-top {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 20px;
  }

  .logo-frame {
    width: 64px;
    height: 64px;
    flex: 0 0 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    border-radius: 14px;
    overflow: hidden;
  }

  .logo-frame img {
    max-width: 44px;
    max-height: 44px;
    object-fit: contain;
  }

  .brand-eyebrow {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .brand-title {
    margin: 0;
    font-size: 28px;
    line-height: 1.15;
    font-weight: 700;
  }

  .brand-subtitle {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.84);
  }

  .document-meta-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .meta-card {
    min-height: 86px;
    padding: 14px 16px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.08);
  }

  .meta-label {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
  }

  .meta-value {
    margin: 0;
    font-size: 17px;
    line-height: 1.3;
    font-weight: 700;
    word-break: break-word;
  }

  .meta-caption {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.76);
  }

  .document-body {
    padding: 32px 36px 36px;
  }

  .print-hint {
    margin: 0 0 24px;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
    font-size: 12px;
    line-height: 1.6;
    color: var(--muted);
  }

  .alert-panel {
    margin-bottom: 22px;
    padding: 14px 16px 14px 18px;
    border-left: 5px solid currentColor;
    border-radius: 12px;
  }

  .alert-neutral {
    background: var(--neutral-bg);
    color: var(--neutral-text);
  }

  .alert-warning {
    background: var(--warning-bg);
    color: var(--warning-text);
  }

  .alert-danger {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  .alert-title {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 700;
  }

  .alert-body {
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
  }

  .section {
    margin-bottom: 30px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }

  .section-title {
    margin: 0;
    font-size: 18px;
    line-height: 1.3;
    font-weight: 700;
  }

  .section-caption {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
  }

  .section-meta {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
    text-align: right;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 22px;
  }

  .summary-card {
    min-height: 108px;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: #ffffff;
  }

  .summary-card-label {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .summary-card-value {
    margin: 0;
    font-size: 24px;
    line-height: 1.15;
    font-weight: 700;
    color: var(--brand);
    word-break: break-word;
  }

  .summary-card-caption {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
  }

  .measurement-table-wrapper {
    margin-bottom: 18px;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .measurement-table-title {
    margin: 0;
    padding: 14px 16px;
    background: var(--panel);
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }

  .measurement-table {
    width: 100%;
    border-collapse: collapse;
  }

  .measurement-table th,
  .measurement-table td {
    padding: 10px 12px;
    border-top: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
    font-size: 12px;
    line-height: 1.55;
  }

  .measurement-table th {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    background: #ffffff;
  }

  .measurement-name {
    font-weight: 700;
    color: var(--ink);
  }

  .measurement-value {
    font-weight: 700;
    color: var(--brand);
    white-space: nowrap;
  }

  .measurement-notes {
    color: var(--muted);
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    display: inline-block;
  }

  .status-normal {
    background: var(--success-bg);
    color: var(--success-text);
  }

  .status-normal .status-dot {
    background: var(--success-text);
  }

  .status-borderline {
    background: var(--warning-bg);
    color: var(--warning-text);
  }

  .status-borderline .status-dot {
    background: var(--warning-text);
  }

  .status-abnormal {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  .status-abnormal .status-dot {
    background: var(--danger-text);
  }

  .status-neutral {
    background: var(--neutral-bg);
    color: var(--neutral-text);
  }

  .status-neutral .status-dot {
    background: var(--neutral-text);
  }

  .report-card {
    margin-bottom: 18px;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: #ffffff;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .report-card-title {
    margin: 0;
    padding: 14px 16px;
    background: var(--panel);
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
  }

  .report-card-body {
    margin: 0;
    padding: 16px;
    font-size: 13px;
    line-height: 1.75;
    color: var(--ink);
    white-space: pre-wrap;
  }

  .report-intro {
    margin-bottom: 22px;
    padding: 18px 20px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
  }

  .report-intro-label {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--brand-accent);
  }

  .report-intro-title {
    margin: 0;
    font-size: 22px;
    line-height: 1.35;
    font-weight: 700;
    color: var(--brand);
  }

  .empty-state {
    margin: 0;
    padding: 18px;
    border: 1px dashed var(--border);
    border-radius: 14px;
    background: #ffffff;
    font-size: 13px;
    line-height: 1.7;
    color: var(--muted);
  }

  .document-footer-note {
    margin-top: 30px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    line-height: 1.7;
    color: var(--muted);
  }

  @media print {
    body {
      background: #ffffff;
      padding: 0;
    }

    .document-shell {
      max-width: none;
      box-shadow: none;
    }

    .print-hint {
      display: none;
    }
  }

  @page {
    size: A4;
    margin: 14mm;
  }
`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatStateLabel(stateValue) {
  if (stateValue === "pending") {
    return "Processing";
  }

  if (stateValue === "ready") {
    return "Ready";
  }

  if (stateValue === "not_found") {
    return "Not Found";
  }

  if (stateValue === "error" || stateValue === "failed") {
    return "Failed";
  }

  if (stateValue === "loading") {
    return "Loading";
  }

  return "Idle";
}

function getStatusToneClass(statusCode) {
  if (
    statusCode === "borderline" ||
    statusCode === "borderline_high" ||
    statusCode === "borderline_low"
  ) {
    return "status-borderline";
  }

  if (statusCode === "high" || statusCode === "low" || statusCode === "abnormal") {
    return "status-abnormal";
  }

  if (statusCode === "normal") {
    return "status-normal";
  }

  return "status-neutral";
}

function getAlertToneClass(tone) {
  if (tone === "danger") {
    return "alert-danger";
  }

  if (tone === "warning") {
    return "alert-warning";
  }

  return "alert-neutral";
}

function resolveToneFromState(state) {
  if (state === "failed" || state === "error") {
    return "danger";
  }

  if (state === "pending" || state === "loading") {
    return "warning";
  }

  return "neutral";
}

function getMeasurementsDocumentStatusText(state) {
  if (state === "pending" || state === "loading") {
    return "AI measurements were still processing when this document was prepared.";
  }

  if (state === "failed" || state === "error") {
    return "AI measurements could not be loaded for this study.";
  }

  if (state === "not_found") {
    return "No AI measurements are available for this study.";
  }

  return "AI measurements are not available.";
}

function getReportDocumentStatusText(state, detail) {
  if (state === "pending" || state === "loading") {
    return "The AI report was still processing when this document was prepared.";
  }

  if (state === "failed" || state === "error") {
    return detail || "The AI report could not be generated for this study.";
  }

  if (state === "not_found") {
    return "No AI report is available for this study.";
  }

  return "The AI report is not available.";
}

function getPublicAssetUrl(relativePath) {
  const basePath = process.env.PUBLIC_URL || "";
  const normalizedPath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${window.location.origin}${basePath}${normalizedPath}`;
}

function renderSummaryCards(cards) {
  if (!cards.length) {
    return "";
  }

  return `
    <section class="summary-cards">
      ${cards
        .map(
          card => `
            <article class="summary-card">
              <p class="summary-card-label">${escapeHtml(card.label)}</p>
              <p class="summary-card-value">${escapeHtml(card.value || "-")}</p>
              ${
                card.caption
                  ? `<p class="summary-card-caption">${escapeHtml(card.caption)}</p>`
                  : ""
              }
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderAlertPanel(title, body, tone = "neutral") {
  if (!body) {
    return "";
  }

  return `
    <section class="alert-panel ${getAlertToneClass(tone)}">
      <h3 class="alert-title">${escapeHtml(title)}</h3>
      <p class="alert-body">${escapeHtml(body)}</p>
    </section>
  `;
}

function renderStatusBadge(status) {
  const label = status?.label || "No Reference";

  return `
    <span class="status-badge ${getStatusToneClass(status?.code)}">
      <span class="status-dot"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderMeasurementTable(title, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  return `
    <section class="measurement-table-wrapper">
      <h3 class="measurement-table-title">${escapeHtml(title)}</h3>
      <table class="measurement-table">
        <thead>
          <tr>
            <th>Measurement</th>
            <th>Result</th>
            <th>Status</th>
            <th>Reference</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              item => `
                <tr>
                  <td class="measurement-name">${escapeHtml(item.label || "Measurement")}</td>
                  <td class="measurement-value">${escapeHtml(item.valueText || "-")}</td>
                  <td>${renderStatusBadge(item.status)}</td>
                  <td>${escapeHtml(item.referenceRangeText || "-")}</td>
                  <td class="measurement-notes">${escapeHtml(item.notesText || "-")}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderReportSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return `<p class="empty-state">No narrative report sections are available for this study.</p>`;
  }

  return sections
    .map(
      (section, index) => `
        <section class="report-card">
          <h3 class="report-card-title">${escapeHtml(
            section.title || `Report Section ${index + 1}`
          )}</h3>
          <p class="report-card-body">${escapeHtml(
            section.body || "No report content available."
          )}</p>
        </section>
      `
    )
    .join("");
}

function buildMeasurementsSummaryCards(data) {
  return [
    {
      label: "Study UID",
      value: data.studyUid || "-",
      caption: data.downloadedAt || "Prepared just now",
    },
    {
      label: "Total Measurements",
      value: String(data.aiMeasurements.totalMeasurements || 0),
      caption: formatStateLabel(data.aiMeasurements.state),
    },
    {
      label: "Out Of Range",
      value: String(data.aiMeasurements.summary.outOfRangeCount || 0),
      caption: "High, low, or borderline findings",
    },
  ];
}

function buildReportSummaryCards(data) {
  return [
    {
      label: "Study UID",
      value: data.studyUid || "-",
      caption: data.downloadedAt || "Prepared just now",
    },
    {
      label: "Report Status",
      value: formatStateLabel(data.aiReport.state),
      caption: data.aiReport.reportGeneratedAt || "Generation time unavailable",
    },
    {
      label: "Supporting Findings",
      value: String(data.aiMeasurements.summary.outOfRangeCount || 0),
      caption: "Out-of-range AI measurement findings",
    },
  ];
}

function renderHeaderMetaCards(cards) {
  return `
    <section class="document-meta-grid">
      ${cards
        .map(
          card => `
            <article class="meta-card">
              <p class="meta-label">${escapeHtml(card.label)}</p>
              <p class="meta-value">${escapeHtml(card.value || "-")}</p>
              ${
                card.caption
                  ? `<p class="meta-caption">${escapeHtml(card.caption)}</p>`
                  : ""
              }
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function buildBaseDocumentHtml({
  documentTitle,
  documentSubtitle,
  headerCards,
  bodyHtml,
  autoPrint = false,
}) {
  const logoUrl = getPublicAssetUrl("/horalix-pdf-logo.png");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(documentTitle)}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        <main class="document-shell">
          <header class="document-header">
            <div class="document-header-top">
              <div class="logo-frame">
                <img src="${escapeHtml(logoUrl)}" alt="Horalix logo" />
              </div>
              <div>
                <p class="brand-eyebrow">Horalix</p>
                <h1 class="brand-title">${escapeHtml(documentTitle)}</h1>
                <p class="brand-subtitle">${escapeHtml(documentSubtitle)}</p>
              </div>
            </div>
            ${renderHeaderMetaCards(headerCards)}
          </header>

          <section class="document-body">
            <p class="print-hint">
              The print dialog opens automatically. From that screen you can print immediately or choose
              your browser's "Save as PDF" destination to download a PDF copy.
            </p>
            ${bodyHtml}
            <footer class="document-footer-note">
              Horalix AI-generated study documentation. This print-preview document is intended for review,
              discussion, and archiving within hospital workflows.
            </footer>
          </section>
        </main>
        ${
          autoPrint
            ? `
              <script>
                window.addEventListener("load", function () {
                  window.setTimeout(function () {
                    window.focus();
                    window.print();
                  }, 350);
                });
              </script>
            `
            : ""
        }
      </body>
    </html>
  `;
}

function withAutoPrintScript(html) {
  const autoPrintScript = `
    <script>
      window.addEventListener("load", function () {
        window.setTimeout(function () {
          window.focus();
          window.print();
        }, 350);
      });
    </script>
  `;

  return html.replace("</body>", `${autoPrintScript}</body>`);
}

async function openPrintPreview({
  html,
  windowTitle,
}) {
  if (window.electronAPI?.report?.previewPdf) {
    const previewResult = await window.electronAPI.report.previewPdf(
      html,
      {
        printBackground: true,
        pageSize: "A4",
        landscape: false,
      },
      windowTitle
    );

    if (!previewResult?.ok) {
      window.alert(previewResult?.error || "The print preview could not be opened.");
    }

    return;
  }

  const printWindow = window.open("", "_blank", "width=1100,height=900");

  if (!printWindow) {
    window.alert("The print preview could not be opened. Please allow pop-ups for this site.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(withAutoPrintScript(html));
  printWindow.document.title = windowTitle;
  printWindow.document.close();
}

function buildMeasurementsBodyHtml(data) {
  const sections = [];

  sections.push(renderSummaryCards(buildMeasurementsSummaryCards(data)));

  if (data.editState.hasOverrides) {
    sections.push(
      renderAlertPanel(
        "Manual Editing Notice",
        data.editState.isReportStale
          ? `Manual overrides were applied on ${data.editState.overridesUpdatedAt || "this study"}, and the AI report may be older than the latest edited measurements.`
          : `Manual overrides were applied on ${data.editState.overridesUpdatedAt || "this study"}.`,
        data.editState.isReportStale ? "warning" : "neutral"
      )
    );
  }

  sections.push(`
    <section class="section">
      <header class="section-header">
        <div>
          <h2 class="section-title">AI Measurements</h2>
          <p class="section-caption">Structured echocardiography measurement summary for hospital review.</p>
        </div>
        <p class="section-meta">${escapeHtml(formatStateLabel(data.aiMeasurements.state))}</p>
      </header>
      ${
        data.aiMeasurements.state === "ready"
          ? `
            ${
              data.aiMeasurements.outliers.length > 0
                ? renderMeasurementTable("Flagged Findings", data.aiMeasurements.outliers)
                : ""
            }
            ${
              data.aiMeasurements.mainMeasurements.length > 0
                ? renderMeasurementTable("Main Measurements", data.aiMeasurements.mainMeasurements)
                : ""
            }
            ${data.aiMeasurements.measurementSections
              .map(section =>
                renderMeasurementTable(section.section || "Measurements", section.items)
              )
              .join("")}
            ${
              data.aiMeasurements.totalMeasurements === 0
                ? `<p class="empty-state">AI measurements are ready, but no measurement rows are available for this study.</p>`
                : ""
            }
          `
          : renderAlertPanel(
              "Measurements Status",
              getMeasurementsDocumentStatusText(data.aiMeasurements.state),
              resolveToneFromState(data.aiMeasurements.state)
            )
      }
    </section>
  `);

  return sections.join("");
}

function buildReportBodyHtml(data) {
  const sections = [];

  sections.push(renderSummaryCards(buildReportSummaryCards(data)));

  if (data.editState.isReportStale) {
    sections.push(
      renderAlertPanel(
        "Report Freshness Notice",
        "Measurements were edited after the last AI report was generated. Review the narrative below together with the current measurement summary.",
        "warning"
      )
    );
  }

  sections.push(`
    <section class="section">
      <header class="section-header">
        <div>
          <h2 class="section-title">AI Clinical Report</h2>
          <p class="section-caption">Narrative echocardiography interpretation prepared for hospital workflows.</p>
        </div>
        <p class="section-meta">${
          data.aiReport.reportGeneratedAt
            ? escapeHtml(data.aiReport.reportGeneratedAt)
            : escapeHtml(formatStateLabel(data.aiReport.state))
        }</p>
      </header>
      ${
        data.aiReport.state === "ready"
          ? `
            ${
              data.aiReport.mainTitle
                ? `
                  <section class="report-intro">
                    <p class="report-intro-label">Report Overview</p>
                    <h3 class="report-intro-title">${escapeHtml(data.aiReport.mainTitle)}</h3>
                  </section>
                `
                : ""
            }
            ${
              data.aiMeasurements.state === "ready" &&
              data.aiMeasurements.outliers.length > 0
                ? `
                  <section class="section">
                    <header class="section-header">
                      <div>
                        <h2 class="section-title">Supporting Measurement Findings</h2>
                        <p class="section-caption">Key structured findings to review alongside the narrative report.</p>
                      </div>
                    </header>
                    ${renderMeasurementTable(
                      "Highlighted AI Findings",
                      data.aiMeasurements.outliers.slice(0, 8)
                    )}
                  </section>
                `
                : ""
            }
            ${renderReportSections(data.aiReport.sections)}
          `
          : renderAlertPanel(
              "Report Status",
              getReportDocumentStatusText(data.aiReport.state, data.aiReport.detail),
              resolveToneFromState(data.aiReport.state)
            )
      }
    </section>
  `);

  return sections.join("");
}

export async function openAiMeasurementsPrintPreview(studyResultsPdfData) {
  if (!studyResultsPdfData) {
    return;
  }

  const html = buildBaseDocumentHtml({
    documentTitle: "AI Measurements",
    documentSubtitle: "Structured echocardiography measurement summary",
    headerCards: buildMeasurementsSummaryCards(studyResultsPdfData),
    bodyHtml: buildMeasurementsBodyHtml(studyResultsPdfData),
    autoPrint: false,
  });

  await openPrintPreview({
    html,
    windowTitle: `Horalix AI Measurements - ${studyResultsPdfData.studyUid || "Study"}`,
  });
}

export async function openAiReportPrintPreview(studyResultsPdfData) {
  if (!studyResultsPdfData) {
    return;
  }

  const html = buildBaseDocumentHtml({
    documentTitle: "AI Clinical Report",
    documentSubtitle: "Narrative echocardiography summary",
    headerCards: buildReportSummaryCards(studyResultsPdfData),
    bodyHtml: buildReportBodyHtml(studyResultsPdfData),
    autoPrint: false,
  });

  await openPrintPreview({
    html,
    windowTitle: `Horalix AI Report - ${studyResultsPdfData.studyUid || "Study"}`,
  });
}
