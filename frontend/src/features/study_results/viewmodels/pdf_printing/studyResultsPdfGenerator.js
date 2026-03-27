const PRINT_STYLES = `
  :root {
    color-scheme: light;
    --ink: #000000;
    --secondary: #4A4A4A;
    --tertiary: #999999;
    --rule: #CCCCCC;
    --line: #E5E5E5;
    --fill: #F5F5F5;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #FFFFFF;
    color: var(--ink);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
    line-height: 1.35;
  }

  body {
    width: 210mm;
    margin: 0 auto;
  }

  .document {
    width: 210mm;
    margin: 0 auto;
    background: #FFFFFF;
  }

  @media screen {
    body {
      background: #DCDCDC;
      padding: 12px 0 24px;
    }

    .document {
      display: grid;
      gap: 12px;
    }

    .page {
      box-shadow: 0 0 0 1px #D8D8D8;
    }
  }

  .page {
    position: relative;
    width: 210mm;
    height: 297mm;
    page-break-after: always;
    break-after: page;
    background: #FFFFFF;
    overflow: hidden;
  }

  .page:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .running-header {
    position: absolute;
    top: 6mm;
    left: 18mm;
    right: 18mm;
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    gap: 8px;
    align-items: end;
    padding-bottom: 2.5mm;
    border-bottom: 1px solid var(--rule);
    font-size: 7.5pt;
    color: var(--secondary);
  }

  .running-header-left {
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tertiary);
  }

  .running-header-center {
    text-align: center;
  }

  .running-header-right {
    text-align: right;
    color: var(--tertiary);
  }

  .page-content {
    position: absolute;
    top: 22mm;
    left: 18mm;
    right: 18mm;
    bottom: 20mm;
    overflow: hidden;
  }

  .running-footer {
    position: absolute;
    left: 18mm;
    right: 18mm;
    bottom: 6mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding-top: 2.5mm;
    border-top: 1px solid var(--rule);
    font-size: 7.5pt;
    color: var(--tertiary);
  }

  .running-footer-left {
    font-style: italic;
  }

  .patient-block {
    margin-bottom: 6px;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--ink);
  }

  .patient-block-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 4px 0 2px;
    border-bottom: 1px solid var(--line);
  }

  .patient-logo {
    width: 12mm;
    height: 12mm;
    object-fit: contain;
    flex: 0 0 12mm;
  }

  .patient-title-wrap {
    margin-left: auto;
    text-align: right;
  }

  .report-title {
    margin: 0;
    font-size: 16pt;
    font-weight: 700;
    color: var(--ink);
  }

  .report-subtitle {
    margin: 3px 0 0;
    font-size: 9pt;
    color: var(--secondary);
  }

  .patient-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px 10px;
    padding: 6px 0 5px;
    border-bottom: 1px solid var(--line);
  }

  .field {
    min-height: 20px;
  }

  .field-span-2 {
    grid-column: span 2;
  }

  .field-span-4 {
    grid-column: span 4;
  }

  .field-label {
    margin: 0 0 2px;
    font-size: 7.5pt;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--tertiary);
  }

  .field-value {
    margin: 0;
    font-size: 9.5pt;
    color: var(--ink);
    word-break: break-word;
  }

  .field-value-patient {
    font-size: 13pt;
    font-weight: 700;
  }

  .field-blank {
    display: inline-block;
    min-width: 88px;
    color: var(--secondary);
  }

  .findings-summary-line {
    padding: 5px 0 4px;
    font-size: 8.5pt;
    color: var(--ink);
  }

  .findings-summary-label {
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .findings-summary-note {
    margin: 0 0 4px;
    font-size: 8pt;
    line-height: 1.35;
    font-style: italic;
    color: var(--tertiary);
  }

  .clinical-report-title-block {
    margin: 10px 0 12px;
    text-align: center;
  }

  .clinical-report-title {
    margin: 0;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .clinical-report-rule {
    width: 60%;
    margin: 8px auto 0;
    border-bottom: 2px solid var(--ink);
  }

  .section-heading {
    margin: 14px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--ink);
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .section-paragraph {
    margin: 0 0 8px;
    font-size: 9.5pt;
    line-height: 1.5;
    color: var(--ink);
  }

  .section-note {
    margin: 0;
    font-size: 8.5pt;
    line-height: 1.45;
    color: var(--secondary);
  }

  .callout {
    margin: 9px 0;
    padding: 10px 0 10px 12px;
    border-left: 3px solid var(--ink);
    background: var(--fill);
  }

  .callout-impression {
    margin: 15px 0;
  }

  .callout-title {
    margin: 0 0 8px;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .callout-title-large {
    font-size: 11pt;
  }

  .callout-body {
    margin: 0;
    font-size: 10pt;
    line-height: 1.45;
    color: var(--ink);
  }

  .callout-body-prominent {
    font-weight: 700;
  }

  .callout-note {
    margin: 8px 0 0;
    font-size: 8pt;
    line-height: 1.4;
    font-style: italic;
    color: var(--tertiary);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin: 0;
  }

  .data-table col.measurement-col {
    width: 31.6%;
  }

  .data-table col.result-col {
    width: 20.1%;
  }

  .data-table col.status-col {
    width: 20.1%;
  }

  .data-table col.reference-col {
    width: 28.2%;
  }

  .data-table thead th {
    padding: 5px 6px;
    border-bottom: 1px solid var(--line);
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--tertiary);
    text-align: left;
  }

  .data-table thead th.result-cell {
    text-align: right;
  }

  .data-table thead th.status-cell {
    text-align: center;
  }

  .data-table tbody td {
    padding: 5px 6px;
    border-bottom: 1px solid var(--line);
    font-size: 9.5pt;
    vertical-align: top;
  }

  .data-table tbody tr:last-child td {
    border-bottom: none;
  }

  .measurement-cell {
    text-align: left;
  }

  .measurement-cell-flagged {
    font-weight: 700;
  }

  .result-cell {
    text-align: right;
    font-weight: 700;
    white-space: nowrap;
  }

  .result-cell-qualitative {
    font-style: italic;
    font-weight: 400;
    color: var(--secondary);
    white-space: normal;
  }

  .status-cell {
    text-align: center;
  }

  .reference-cell {
    text-align: left;
    color: var(--secondary);
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    border: 1px solid #CCCCCC;
    background: var(--fill);
    border-radius: 2px;
    font-size: 8.5pt;
    white-space: nowrap;
  }

  .status-badge-accent {
    box-shadow: inset 1.5px 0 0 #000000;
    padding-left: 8px;
    font-weight: 700;
  }

  .status-symbol {
    display: inline-block;
    min-width: 9px;
    text-align: center;
    font-weight: 700;
  }

  .status-normal {
    font-weight: 400;
  }

  .empty-state {
    margin: 0;
    font-size: 9.5pt;
    color: var(--secondary);
  }

  .physician-block {
    margin-top: 20mm;
    padding-top: 10px;
    border-top: 1px solid var(--ink);
  }

  .physician-title {
    margin: 0 0 14px;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .physician-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    margin-bottom: 12px;
    font-size: 8pt;
    color: var(--tertiary);
    text-transform: uppercase;
  }

  .physician-line {
    flex: 0 0 60mm;
    border-bottom: 1px solid var(--rule);
    min-height: 16px;
  }

  .physician-line-date {
    flex-basis: 30mm;
  }

  .physician-disclaimer {
    max-width: 75%;
    margin: 10px 0 0;
    font-size: 7.5pt;
    line-height: 1.45;
    font-style: italic;
    color: var(--tertiary);
  }

  @page {
    size: A4 portrait;
    margin: 0;
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

function normalizeTitleKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getPublicAssetUrl(relativePath) {
  const basePath = process.env.PUBLIC_URL || "";
  const normalizedPath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${window.location.origin}${basePath}${normalizedPath}`;
}

function renderValueOrBlank(value, minimumLength = 12) {
  if (value) {
    return escapeHtml(value);
  }

  return `<span class="field-blank">${"_".repeat(minimumLength)}</span>`;
}

function getStatusBadgeClass(statusCode) {
  if (statusCode === "normal") {
    return "status-badge status-normal";
  }

  return "status-badge status-badge-accent";
}

function renderStatusBadge(status) {
  if (!status || status.code === "unknown") {
    return "—";
  }

  return `
    <span class="${getStatusBadgeClass(status.code)}">
      <span class="status-symbol">${escapeHtml(status.symbol)}</span>
      <span>${escapeHtml(status.label)}</span>
    </span>
  `;
}

function renderMeasurementsTable(items, { emphasizeMeasurements = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="empty-state">No findings are available for this section.</p>`;
  }

  return `
    <table class="data-table">
      <colgroup>
        <col class="measurement-col" />
        <col class="result-col" />
        <col class="status-col" />
        <col class="reference-col" />
      </colgroup>
      <thead>
        <tr>
          <th>Measurement</th>
          <th class="result-cell">Result</th>
          <th class="status-cell">Status</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            item => `
              <tr>
                <td class="measurement-cell ${
                  emphasizeMeasurements ? "measurement-cell-flagged" : ""
                }">${escapeHtml(item.label || "Measurement")}</td>
                <td class="result-cell ${
                  item.isQualitative ? "result-cell-qualitative" : ""
                }">${escapeHtml(item.valueText || "—")}</td>
                <td class="status-cell">${renderStatusBadge(item.status)}</td>
                <td class="reference-cell">${escapeHtml(item.referenceRangeText || "—")}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderSectionHeading(title) {
  return `<h2 class="section-heading">${escapeHtml(title)}</h2>`;
}

function renderMeasurementsSection(title, items) {
  if (!items?.length) {
    return "";
  }

  return `
    ${renderSectionHeading(title)}
    ${renderMeasurementsTable(items)}
  `;
}

function renderFlaggedFindingsCallout(title, items, noteText) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  return `
    <section class="callout">
      <h3 class="callout-title">${escapeHtml(title)}</h3>
      ${renderMeasurementsTable(items, { emphasizeMeasurements: true })}
      ${
        noteText
          ? `<p class="callout-note">${escapeHtml(noteText)}</p>`
          : ""
      }
    </section>
  `;
}

function normalizeNarrativeText(text) {
  const normalizedText = String(text ?? "").trim();

  if (!normalizedText) {
    return "";
  }

  return normalizedText
    .replace(/(\d(?:[\d.,])*)\s*(cm³|cm\^3|cm3)/gi, "$1 mL")
    .replace(
      /does not require further investigation unless new symptoms develop\./gi,
      "No findings suggesting need for additional investigation were identified. Clinical correlation is recommended."
    )
    .trim();
}

function convertNarrativeBodyToParagraphs(body) {
  const normalizedBody = normalizeNarrativeText(body);

  if (!normalizedBody) {
    return [];
  }

  const blocks = normalizedBody
    .split(/\n\s*\n/)
    .map(block =>
      block
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:])/g, "$1")
        .trim()
    )
    .filter(Boolean);

  return blocks.length > 0 ? blocks : [normalizedBody];
}

function renderNarrativeSection(title, body) {
  const paragraphs = convertNarrativeBodyToParagraphs(body);

  return `
    ${renderSectionHeading(title)}
    ${
      paragraphs.length > 0
        ? paragraphs
            .map(paragraph => `<p class="section-paragraph">${escapeHtml(paragraph)}</p>`)
            .join("")
        : `<p class="section-note">Not reported in the available data.</p>`
    }
  `;
}

function renderImpressionCallout(text) {
  if (!text) {
    return "";
  }

  const paragraphs = convertNarrativeBodyToParagraphs(text);
  const isShortImpression = paragraphs.length === 1 && paragraphs[0].length <= 180;

  return `
    <section class="callout callout-impression">
      <h3 class="callout-title callout-title-large">Impression</h3>
      ${paragraphs
        .map(
          paragraph => `
            <p class="callout-body ${isShortImpression ? "callout-body-prominent" : ""}">
              ${escapeHtml(paragraph)}
            </p>
          `
        )
        .join("")}
    </section>
  `;
}

function renderUncertaintySection(text) {
  if (!text) {
    return "";
  }

  const paragraphs = convertNarrativeBodyToParagraphs(text).map(paragraph =>
    paragraph
      .replace(
        /no further investigation is required/gi,
        "No findings suggesting need for additional investigation were identified"
      )
      .replace(
        /does not require further investigation/gi,
        "No findings suggesting need for additional investigation were identified"
      )
      .replace(
        /unless new symptoms develop/gi,
        "Clinical correlation is recommended"
      )
      .trim()
  );

  const finalParagraphs =
    paragraphs.length > 0 &&
    !paragraphs[paragraphs.length - 1].match(
      /(clinical correlation is recommended|correlation with clinical presentation is advised)\.?$/i
    )
      ? [...paragraphs, "Clinical correlation is recommended."]
      : paragraphs;

  return `
    ${renderSectionHeading("Uncertainty and Recommendations")}
    ${finalParagraphs
      .map(paragraph => `<p class="section-note">${escapeHtml(paragraph)}</p>`)
      .join("")}
  `;
}

function renderPhysicianAttestationBlock() {
  return `
    <section class="physician-block">
      <h3 class="physician-title">Interpreting Physician</h3>
      <div class="physician-row">
        <span>Reviewed by:</span>
        <span class="physician-line"></span>
        <span>MD</span>
        <span>Date:</span>
        <span class="physician-line physician-line-date"></span>
      </div>
      <div class="physician-row">
        <span>Signature:</span>
        <span class="physician-line"></span>
      </div>
      <div class="physician-row">
        <span>Electronic Signature ID:</span>
        <span class="physician-line"></span>
      </div>
      <p class="physician-disclaimer">
        This report was generated with AI assistance (Horalix CardiologyAI). All
        AI-derived findings are preliminary and require independent physician
        verification before clinical use. This report does not constitute a final
        medical interpretation until signed by the interpreting physician.
      </p>
    </section>
  `;
}

function renderRunningHeader(data, pageNumber, pageCount, { simplified = false } = {}) {
  const patientName = data.patient?.displayName || "________________";
  const mrn = data.patient?.mrn || "__________";
  const dob = data.patient?.dob || "__________";

  return `
    <header class="running-header">
      <div class="running-header-left">Horalix</div>
      <div class="running-header-center">
        ${
          simplified
            ? ""
            : `${escapeHtml(patientName)} | MRN: ${escapeHtml(mrn)} | DOB: ${escapeHtml(dob)}`
        }
      </div>
      <div class="running-header-right">Page ${pageNumber} of ${pageCount}</div>
    </header>
  `;
}

function renderRunningFooter(data) {
  return `
    <footer class="running-footer">
      <div class="running-footer-left">AI-Assisted — Requires Physician Verification</div>
      <div>Exam: ${escapeHtml(data.patient?.examDate || "______________")}</div>
    </footer>
  `;
}

function renderPatientFieldCell(label, value, options = {}) {
  const spanClass = options.span ? ` field-span-${options.span}` : "";
  const valueClass = options.patientName ? "field-value field-value-patient" : "field-value";

  return `
    <div class="field${spanClass}">
      <p class="field-label">${escapeHtml(label)}</p>
      <p class="${valueClass}">${renderValueOrBlank(value, options.blankLength || 12)}</p>
    </div>
  `;
}

function renderPatientHeaderBlock(data, { reportTitle, reportSubtitle, includeFindingsSummary }) {
  const logoUrl = getPublicAssetUrl("/horalix-pdf-logo.png");
  const findingsSummaryText = includeFindingsSummary
    ? `${data.aiMeasurements.totalMeasurements} measurements · ${data.aiMeasurements.summary.borderlineCount} borderline · ${data.aiMeasurements.summary.criticalCount} critical`
    : null;

  return `
    <section class="patient-block">
      <div class="patient-block-top">
        <img class="patient-logo" src="${escapeHtml(logoUrl)}" alt="Horalix logo" />
        <div class="patient-title-wrap">
          <h1 class="report-title">${escapeHtml(reportTitle)}</h1>
          <p class="report-subtitle">${escapeHtml(reportSubtitle)}</p>
        </div>
      </div>

      <div class="patient-grid">
        ${renderPatientFieldCell("Patient", data.patient?.displayName, {
          span: 2,
          patientName: true,
          blankLength: 18,
        })}
        ${renderPatientFieldCell("MRN", data.patient?.mrn)}
        ${renderPatientFieldCell("DOB", data.patient?.dob)}

        ${renderPatientFieldCell("Age / Sex", data.patient?.ageSexText || "___ / ___")}
        ${renderPatientFieldCell("Height", data.patient?.heightText)}
        ${renderPatientFieldCell("Weight", data.patient?.weightText)}
        ${renderPatientFieldCell("BSA", data.patient?.bsaText)}

        ${renderPatientFieldCell("HR", data.patient?.heartRateText)}
        ${renderPatientFieldCell("Referring", data.patient?.referringPhysicianName)}
        ${renderPatientFieldCell("Sonographer", data.patient?.sonographerName)}
        ${renderPatientFieldCell("Machine", data.patient?.machineName)}

        ${renderPatientFieldCell("Indication", data.patient?.indication, {
          span: 2,
          blankLength: 26,
        })}
        ${renderPatientFieldCell("Exam Date", data.patient?.examDate, {
          span: 1,
          blankLength: 18,
        })}
        ${renderPatientFieldCell("Status", data.patient?.reportStatus, {
          span: 1,
          blankLength: 16,
        })}
      </div>

      ${
        findingsSummaryText
          ? `
            <div class="findings-summary-line">
              <span class="findings-summary-label">Findings Summary:</span>
              ${escapeHtml(findingsSummaryText)}
            </div>
            ${
              data.aiMeasurements?.showSexReferenceNote
                ? `
                  <p class="findings-summary-note">
                    * Sex not provided — male and female reference ranges shown where applicable.
                  </p>
                `
                : ""
            }
          `
        : ""
      }
    </section>
  `;
}

function findMeasurementSection(data, sectionTitle) {
  return (
    data.aiMeasurements.measurementSections.find(
      section => normalizeTitleKey(section.section) === normalizeTitleKey(sectionTitle)
    ) || null
  );
}

function findNarrativeSection(sections, titlePatterns) {
  return (
    sections.find(section =>
      titlePatterns.some(pattern =>
        normalizeTitleKey(section.title).includes(normalizeTitleKey(pattern))
      )
    ) || null
  );
}

function renderMeasurementsStatusNotice(data) {
  if (data.aiMeasurements.state === "pending" || data.aiMeasurements.state === "loading") {
    return `
      <section class="callout">
        <h3 class="callout-title">Measurements Status</h3>
        <p class="callout-body">AI measurements were still processing when this report was prepared.</p>
      </section>
    `;
  }

  if (data.aiMeasurements.state === "failed" || data.aiMeasurements.state === "error") {
    return `
      <section class="callout">
        <h3 class="callout-title">Measurements Status</h3>
        <p class="callout-body">AI measurements could not be loaded for this study.</p>
      </section>
    `;
  }

  if (data.aiMeasurements.state === "not_found") {
    return `
      <section class="callout">
        <h3 class="callout-title">Measurements Status</h3>
        <p class="callout-body">No AI measurements are available for this study.</p>
      </section>
    `;
  }

  return `<p class="empty-state">AI measurements are ready, but no measurement rows are available.</p>`;
}

function renderReportStatusNotice(data) {
  if (data.aiReport.state === "pending" || data.aiReport.state === "loading") {
    return `
      <section class="callout">
        <h3 class="callout-title">Report Status</h3>
        <p class="callout-body">The AI report was still processing when this report was prepared.</p>
      </section>
    `;
  }

  if (data.aiReport.state === "failed" || data.aiReport.state === "error") {
    return `
      <section class="callout">
        <h3 class="callout-title">Report Status</h3>
        <p class="callout-body">${escapeHtml(
          data.aiReport.detail || "The AI report could not be generated for this study."
        )}</p>
      </section>
    `;
  }

  if (data.aiReport.state === "not_found") {
    return `
      <section class="callout">
        <h3 class="callout-title">Report Status</h3>
        <p class="callout-body">No AI report is available for this study.</p>
      </section>
    `;
  }

  return `<p class="empty-state">No narrative report sections are available for this study.</p>`;
}

function renderMeasurementsDocumentPages(data) {
  const flaggedItems = data.aiMeasurements.outliers.slice(0, 6);
  const valvesSection = findMeasurementSection(data, "Valves");
  const lvSection = findMeasurementSection(data, "LV Size & Function");
  const atriaSection = findMeasurementSection(data, "Atria");
  const rightHeartSection = findMeasurementSection(data, "Right Heart");
  const aortaSection = findMeasurementSection(data, "Aorta");
  const devicesSection = findMeasurementSection(data, "Devices / Procedures");

  const pages = [];

  if (data.aiMeasurements.state !== "ready") {
    pages.push(`
      ${renderPatientHeaderBlock(data, {
        reportTitle: "AI Measurements",
        reportSubtitle: "Structured echocardiography measurement summary",
        includeFindingsSummary: true,
      })}
      ${renderMeasurementsStatusNotice(data)}
    `);

    return pages;
  }

  pages.push(`
    ${renderPatientHeaderBlock(data, {
      reportTitle: "AI Measurements",
      reportSubtitle: "Structured echocardiography measurement summary",
      includeFindingsSummary: true,
    })}
    ${
      flaggedItems.length > 0
        ? renderFlaggedFindingsCallout(
            "Flagged Findings",
            flaggedItems,
            "Borderline, high, or low values that may require clinical attention."
          )
        : ""
    }
    ${renderMeasurementsSection("Main Measurements", data.aiMeasurements.mainMeasurements)}
    ${renderMeasurementsSection("Valves", valvesSection?.items || [])}
  `);

  const pageTwoContent = `
    ${renderMeasurementsSection("LV Size & Function", lvSection?.items || [])}
    ${renderMeasurementsSection("Atria", atriaSection?.items || [])}
  `;
  if (pageTwoContent.replace(/\s/g, "")) {
    pages.push(pageTwoContent);
  }

  const pageThreeContent = `
    ${renderMeasurementsSection("Right Heart", rightHeartSection?.items || [])}
    ${renderMeasurementsSection("Aorta", aortaSection?.items || [])}
    ${renderMeasurementsSection("Devices / Procedures", devicesSection?.items || [])}
  `;
  if (pageThreeContent.replace(/\s/g, "")) {
    pages.push(pageThreeContent);
  }

  return pages.filter(Boolean);
}

function renderNarrativeDocumentPages(data) {
  const flaggedItems = data.aiMeasurements.outliers.slice(0, 5);
  const sections = Array.isArray(data.aiReport.sections) ? data.aiReport.sections : [];

  if (data.aiReport.state !== "ready") {
    return [
      `
        ${renderPatientHeaderBlock(data, {
          reportTitle: "AI Report",
          reportSubtitle: "Narrative echocardiography summary",
          includeFindingsSummary: false,
        })}
        <section class="clinical-report-title-block">
          <h2 class="clinical-report-title">Clinical Echocardiography Report</h2>
          <div class="clinical-report-rule"></div>
        </section>
        ${renderReportStatusNotice(data)}
        ${renderPhysicianAttestationBlock()}
      `,
    ];
  }

  const summarySection = findNarrativeSection(sections, ["summary"]);
  const leftVentricleSection = findNarrativeSection(sections, ["left ventricle"]);
  const rightVentricleSection = findNarrativeSection(sections, [
    "right ventricle and pulmonary pressures",
    "right ventricle",
  ]);
  const valvesSection = findNarrativeSection(sections, ["valves"]);
  const chambersSection = findNarrativeSection(sections, ["chambers and great vessels", "chambers"]);
  const pericardiumSection = findNarrativeSection(sections, [
    "pericardium and devices",
    "pericardium",
  ]);
  const impressionSection = findNarrativeSection(sections, [
    "diagnoses",
    "impression",
  ]);
  const uncertaintySection = findNarrativeSection(sections, [
    "uncertainty and recommendations",
    "uncertainty",
    "recommendations",
  ]);

  const matchedTitles = new Set(
    [
      summarySection,
      leftVentricleSection,
      rightVentricleSection,
      valvesSection,
      chambersSection,
      pericardiumSection,
      impressionSection,
      uncertaintySection,
    ]
      .filter(Boolean)
      .map(section => normalizeTitleKey(section.title))
  );

  const unmatchedSections = sections.filter(
    section => !matchedTitles.has(normalizeTitleKey(section.title))
  );

  const firstPage = `
    ${renderPatientHeaderBlock(data, {
      reportTitle: "AI Report",
      reportSubtitle: "Narrative echocardiography summary",
      includeFindingsSummary: false,
    })}
    <section class="clinical-report-title-block">
      <h2 class="clinical-report-title">Clinical Echocardiography Report</h2>
      <div class="clinical-report-rule"></div>
    </section>
    ${
      flaggedItems.length > 0
        ? renderFlaggedFindingsCallout(
            "Highlighted AI Findings",
            flaggedItems,
            "Structured findings with borderline or abnormal values that warrant clinical review."
          )
        : ""
    }
    ${renderNarrativeSection("Summary", summarySection?.body)}
    ${renderNarrativeSection("Left Ventricle", leftVentricleSection?.body)}
    ${renderNarrativeSection(
      "Right Ventricle and Pulmonary Pressures",
      rightVentricleSection?.body
    )}
    ${renderNarrativeSection("Valves", valvesSection?.body)}
  `;

  const secondPage = `
    ${renderNarrativeSection("Chambers and Great Vessels", chambersSection?.body)}
    ${renderNarrativeSection("Pericardium and Devices", pericardiumSection?.body)}
    ${unmatchedSections
      .map(section => renderNarrativeSection(section.title, section.body))
      .join("")}
    ${renderImpressionCallout(impressionSection?.body)}
    ${renderUncertaintySection(uncertaintySection?.body)}
    ${renderPhysicianAttestationBlock()}
  `;

  return [firstPage, secondPage].filter(page => page.replace(/\s/g, ""));
}

function hasRenderableMarkup(markup) {
  return String(markup ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim().length > 0;
}

function buildDocumentHtml(pages, data, { includePatientDetailsOnFirstHeader = false } = {}) {
  const filteredPages = pages.filter(hasRenderableMarkup);
  const pageCount = filteredPages.length;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Horalix Report</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        <main class="document">
          ${filteredPages
            .map(
              (pageContent, pageIndex) => `
                <section class="page">
                  ${renderRunningHeader(data, pageIndex + 1, pageCount, {
                    simplified: pageIndex === 0 && !includePatientDetailsOnFirstHeader,
                  })}
                  <div class="page-content">${pageContent}</div>
                  ${renderRunningFooter(data)}
                </section>
              `
            )
            .join("")}
        </main>
      </body>
    </html>
  `;
}

async function openPrintPreview({ html, windowTitle }) {
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

  const printWindow = window.open("", "_blank", "width=1200,height=900");

  if (!printWindow) {
    window.alert("The print preview could not be opened. Please allow pop-ups for this site.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.title = windowTitle;
  printWindow.document.close();
}

export async function openAiMeasurementsPrintPreview(studyResultsPdfData) {
  if (!studyResultsPdfData) {
    return;
  }

  const html = buildDocumentHtml(
    renderMeasurementsDocumentPages(studyResultsPdfData),
    studyResultsPdfData
  );

  await openPrintPreview({
    html,
    windowTitle: `Horalix AI Measurements - ${
      studyResultsPdfData.patientName || studyResultsPdfData.studyUid || "Study"
    }`,
  });
}

export async function openAiReportPrintPreview(studyResultsPdfData) {
  if (!studyResultsPdfData) {
    return;
  }

  const html = buildDocumentHtml(
    renderNarrativeDocumentPages(studyResultsPdfData),
    studyResultsPdfData
  );

  await openPrintPreview({
    html,
    windowTitle: `Horalix AI Report - ${
      studyResultsPdfData.patientName || studyResultsPdfData.studyUid || "Study"
    }`,
  });
}
