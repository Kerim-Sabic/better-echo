import { formatDateTime } from "@/general_components/utility/dateUtils";

function normalizeFormattedDate(value) {
  return typeof value === "string" && value.trim() && value !== "N/A"
    ? value
    : null;
}

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatClinicalDate(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  if (/^\d{8}$/.test(normalizedValue)) {
    const year = normalizedValue.slice(0, 4);
    const month = normalizedValue.slice(4, 6);
    const day = normalizedValue.slice(6, 8);
    const parsedDate = new Date(`${year}-${month}-${day}T00:00:00`);

    if (!Number.isNaN(parsedDate.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      }).format(parsedDate);
    }
  }

  const parsedDate = new Date(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsedDate);
}

function formatClinicalDateTime(value) {
  const formatted = normalizeFormattedDate(formatDateTime(value));
  if (!formatted) {
    return null;
  }

  return formatted.replace(":00", "");
}

function toTitleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function formatClinicalPatientName(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.includes("^")) {
    const segments = normalizedValue
      .split("^")
      .map(segment => segment.trim())
      .filter(Boolean);

    const givenName = segments[0] || "";
    const familyName = segments[1] || "";

    if (familyName) {
      return `${familyName.toUpperCase()}, ${toTitleCase(givenName)}`;
    }

    return toTitleCase(givenName);
  }

  if (normalizedValue.includes(",")) {
    const [familyName, givenName] = normalizedValue.split(",");
    const normalizedFamily = normalizeText(familyName);
    const normalizedGiven = normalizeText(givenName);

    if (normalizedFamily && normalizedGiven) {
      return `${normalizedFamily.toUpperCase()}, ${toTitleCase(normalizedGiven)}`;
    }
  }

  const words = normalizedValue.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const givenName = words.slice(0, -1).join(" ");
    const familyName = words[words.length - 1];
    return `${familyName.toUpperCase()}, ${toTitleCase(givenName)}`;
  }

  return toTitleCase(normalizedValue);
}

function formatSexShort(value) {
  const normalizedValue = normalizeText(value)?.toLowerCase();

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue === "n/a" ||
    normalizedValue === "na" ||
    normalizedValue === "unknown" ||
    normalizedValue === "unspecified"
  ) {
    return null;
  }

  if (normalizedValue.startsWith("m")) {
    return "M";
  }

  if (normalizedValue.startsWith("f")) {
    return "F";
  }

  if (normalizedValue.startsWith("o")) {
    return "O";
  }

  return normalizedValue.toUpperCase();
}

function normalizeHeightCm(value) {
  const numericValue = normalizeNumber(value);

  if (!numericValue || numericValue <= 0) {
    return null;
  }

  return numericValue < 3 ? numericValue * 100 : numericValue;
}

function normalizeWeightKg(value) {
  const numericValue = normalizeNumber(value);
  return numericValue && numericValue > 0 ? numericValue : null;
}

function formatHeightCm(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 1)} cm` : null;
}

function formatWeightKg(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 1)} kg` : null;
}

function computeBsa(heightCm, weightKg) {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) {
    return null;
  }

  return Math.sqrt((heightCm * weightKg) / 3600);
}

function formatBsa(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 2)} m²` : null;
}

function formatHeartRate(value) {
  const numericValue = normalizeNumber(value);
  return Number.isFinite(numericValue) ? `${formatNumber(numericValue, 0)} bpm` : null;
}

function formatAgeSexText(ageYears, sex) {
  return `${ageYears || "___"} / ${sex || "___"}`;
}

function parseDateLike(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  if (/^\d{8}$/.test(normalizedValue)) {
    const year = normalizedValue.slice(0, 4);
    const month = normalizedValue.slice(4, 6);
    const day = normalizedValue.slice(6, 8);
    const parsedDate = new Date(`${year}-${month}-${day}T00:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function computeAgeYears(birthDate, examDate) {
  const parsedBirthDate = parseDateLike(birthDate);
  const parsedExamDate = parseDateLike(examDate);

  if (!parsedBirthDate || !parsedExamDate) {
    return null;
  }

  let ageYears = parsedExamDate.getFullYear() - parsedBirthDate.getFullYear();
  const monthDelta = parsedExamDate.getMonth() - parsedBirthDate.getMonth();

  if (
    monthDelta < 0 ||
    (monthDelta === 0 && parsedExamDate.getDate() < parsedBirthDate.getDate())
  ) {
    ageYears -= 1;
  }

  return ageYears >= 0 ? ageYears : null;
}

function formatExamDateTime({ studyDate, studyTime, uploadedAt, downloadRequestedAt }) {
  const normalizedStudyDate = normalizeText(studyDate);
  const normalizedStudyTime = normalizeText(studyTime);

  if (normalizedStudyDate && normalizedStudyDate !== "N/A") {
    const dateDigits = normalizedStudyDate.replace(/\D/g, "");
    const timeDigits = normalizedStudyTime ? normalizedStudyTime.replace(/\D/g, "") : "";

    if (dateDigits.length === 8) {
      const year = dateDigits.slice(0, 4);
      const month = dateDigits.slice(4, 6);
      const day = dateDigits.slice(6, 8);
      const hour = timeDigits.length >= 2 ? timeDigits.slice(0, 2) : "00";
      const minute = timeDigits.length >= 4 ? timeDigits.slice(2, 4) : "00";
      const second = timeDigits.length >= 6 ? timeDigits.slice(4, 6) : "00";
      const parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);

      if (!Number.isNaN(parsedDate.getTime())) {
        return formatClinicalDateTime(parsedDate);
      }
    }
  }

  return (
    formatClinicalDateTime(uploadedAt) ||
    formatClinicalDateTime(downloadRequestedAt) ||
    null
  );
}

const UNIT_DISPLAY_MAP = {
  "cm^3": "mL",
  cm3: "mL",
  "cm**3": "mL",
};

function normalizeUnitForDisplay(unit) {
  if (!unit) {
    return unit;
  }

  return UNIT_DISPLAY_MAP[unit] || unit;
}

function isQualitativeMeasurement(kind, rawValue, displayValue) {
  const normalizedKind = normalizeText(kind)?.toLowerCase();

  if (normalizedKind && normalizedKind !== "numeric" && normalizedKind !== "measurement") {
    return true;
  }

  if (Number.isFinite(rawValue)) {
    return false;
  }

  if (
    typeof displayValue === "string" &&
    normalizeNumber(displayValue) === null
  ) {
    return true;
  }

  return false;
}

function formatMeasurementValue(rawValue, displayValue, units) {
  const numericText = Number.isFinite(rawValue) ? formatNumber(rawValue) : null;
  const unitSuffix = units ? ` ${units}` : "";

  if (numericText) {
    return `${numericText}${unitSuffix}`;
  }

  const displayText =
    displayValue === 0
      ? "0"
      : displayValue !== null && displayValue !== undefined && displayValue !== ""
        ? String(displayValue)
        : null;

  if (!displayText) {
    return "—";
  }

  if (units && !displayText.toLowerCase().includes(units.toLowerCase())) {
    return `${displayText}${unitSuffix}`;
  }

  return displayText;
}

function deriveStatusDescriptor({ rangeStatus, rangeDirection, color }) {
  const normalizedRangeStatus = normalizeText(rangeStatus)?.toLowerCase() ?? null;
  const normalizedDirection = normalizeText(rangeDirection)?.toLowerCase() ?? null;
  const normalizedColor = normalizeText(color)?.toLowerCase() ?? null;

  if (normalizedRangeStatus === "normal") {
    return {
      code: "normal",
      label: "Normal",
      severity: 0,
      symbol: "✓",
    };
  }

  if (normalizedRangeStatus === "borderline") {
    return {
      code:
        normalizedDirection === "high"
          ? "borderline_high"
          : normalizedDirection === "low"
            ? "borderline_low"
            : "borderline",
      label: "Borderline",
      severity: 1,
      symbol: "△",
    };
  }

  if (normalizedRangeStatus === "abnormal") {
    if (normalizedDirection === "high") {
      return {
        code: "high",
        label: "High",
        severity: 2,
        symbol: "↑",
      };
    }

    if (normalizedDirection === "low") {
      return {
        code: "low",
        label: "Low",
        severity: 2,
        symbol: "↓",
      };
    }

    return {
      code: "abnormal",
      label: "Abnormal",
      severity: 2,
      symbol: "✕",
    };
  }

  if (normalizedColor === "green") {
    return {
      code: "normal",
      label: "Normal",
      severity: 0,
      symbol: "✓",
    };
  }

  if (normalizedColor === "yellow") {
    return {
      code: "borderline",
      label: "Borderline",
      severity: 1,
      symbol: "△",
    };
  }

  if (normalizedColor === "red") {
    return {
      code: "abnormal",
      label: "Abnormal",
      severity: 2,
      symbol: "✕",
    };
  }

  return {
    code: "unknown",
    label: "No Reference",
    severity: -1,
    symbol: "—",
  };
}

function normalizeMeasurementLabel(label) {
  return normalizeText(label)?.toLowerCase() || "";
}

function matchesMeasurementLabel(label, patterns) {
  const normalizedLabel = normalizeMeasurementLabel(label);
  return patterns.some(pattern => normalizedLabel.includes(pattern));
}

function resolveSexSpecificRange(patientSex, maleRange, femaleRange) {
  if (!maleRange && !femaleRange) {
    return {
      text: null,
      isSexStratified: false,
    };
  }

  if (maleRange && femaleRange && maleRange === femaleRange) {
    return {
      text: maleRange,
      isSexStratified: false,
    };
  }

  if (patientSex === "M" && maleRange) {
    return {
      text: maleRange,
      isSexStratified: true,
    };
  }

  if (patientSex === "F" && femaleRange) {
    return {
      text: femaleRange,
      isSexStratified: true,
    };
  }

  if (maleRange && femaleRange) {
    return {
      text: `${maleRange} (M) / ${femaleRange} (F)`,
      isSexStratified: true,
    };
  }

  return {
    text: maleRange || femaleRange,
    isSexStratified: false,
  };
}

function resolveReferenceRange(label, isQualitative, patientSex) {
  if (isQualitative) {
    return {
      text: "—",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["ejection fraction (ef)"])) {
    return resolveSexSpecificRange(patientSex, "52–72%", "54–74%");
  }

  if (matchesMeasurementLabel(label, ["global longitudinal strain (gls)"])) {
    return {
      text: "≤ –18%",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["pulmonary artery pressure"])) {
    return {
      text: "< 25 mmHg",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["aortic valve peak velocity"])) {
    return {
      text: "< 2.0 m/s",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["max aortic gradient"])) {
    return {
      text: "< 20 mmHg",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["lvot diameter"])) {
    return {
      text: "1.8–2.2 cm",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["lvids", "lv internal diameter (systole)"])) {
    return resolveSexSpecificRange(patientSex, "2.5–4.0 cm", "2.2–3.5 cm");
  }

  if (
    matchesMeasurementLabel(label, [
      "lvidd",
      "lv internal diameter (diastole)",
      "lv internal diameter at diastole",
    ])
  ) {
    return resolveSexSpecificRange(patientSex, "4.2–5.8 cm", "3.8–5.2 cm");
  }

  if (matchesMeasurementLabel(label, ["lv end-diastolic volume", "lvedv"])) {
    return resolveSexSpecificRange(patientSex, "62–150 mL", "46–106 mL");
  }

  if (matchesMeasurementLabel(label, ["lv end-systolic volume", "lvesv"])) {
    return resolveSexSpecificRange(patientSex, "21–61 mL", "14–42 mL");
  }

  if (matchesMeasurementLabel(label, ["lv stroke volume", "lvsv"])) {
    return {
      text: "50–100 mL",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["cardiac output (co)", "cardiac output"])) {
    return {
      text: "4.0–8.0 L/min",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["interventricular septum thickness", "ivsd"])) {
    return resolveSexSpecificRange(patientSex, "0.6–1.0 cm", "0.6–0.9 cm");
  }

  if (matchesMeasurementLabel(label, ["lv posterior wall thickness", "lvpwd"])) {
    return resolveSexSpecificRange(patientSex, "0.6–1.0 cm", "0.6–0.9 cm");
  }

  if (matchesMeasurementLabel(label, ["relative wall thickness", "rwt"])) {
    return {
      text: "0.22–0.42",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["la volume index"])) {
    return {
      text: "< 34 mL/m²",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["la volume"])) {
    return {
      text: "16–52 mL",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["la internal diameter at systole", "laids2d"])) {
    return {
      text: "2.7–3.8 cm",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["e/e′ ratio", "e/e' ratio", "e/e"])) {
    return {
      text: "< 8 normal / 8–14 indeterminate / > 14 elevated",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["rvidd", "rv internal diameter"])) {
    return {
      text: "2.5–4.1 cm",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["tapse"])) {
    return {
      text: "≥ 1.7 cm",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["rv s′ velocity", "rv s' velocity"])) {
    return {
      text: "≥ 9.5 cm/s",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["tricuspid regurgitation velocity", "trv"])) {
    return {
      text: "≤ 2.8 m/s",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["tricuspid regurgitation peak gradient", "trpg"])) {
    return {
      text: "< 36 mmHg",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["ra dimension"])) {
    return {
      text: "< 4.4 cm",
      isSexStratified: false,
    };
  }

  if (matchesMeasurementLabel(label, ["aortic root diameter"])) {
    return resolveSexSpecificRange(patientSex, "2.0–3.7 cm", "2.0–3.4 cm");
  }

  return {
    text: null,
    isSexStratified: false,
  };
}

const MEASUREMENT_LABEL_OVERRIDES = {
  "rv systolic function depressed": "RV Systolic Function",
};

function normalizeMeasurementItem(item, sectionTitle = null, patientSex = null) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const key = normalizeText(item.key);
  const rawLabel =
    normalizeText(item.shortName) || normalizeText(item.label) || key || "Measurement";
  const label =
    MEASUREMENT_LABEL_OVERRIDES[normalizeMeasurementLabel(rawLabel)] || rawLabel;
  const kind = normalizeText(item.kind) || "numeric";
  const units = normalizeUnitForDisplay(normalizeText(item.units));
  const rawValue = Number.isFinite(item.rawValue) ? Number(item.rawValue) : null;
  const displayValue = item.displayValue;
  const isQualitative = isQualitativeMeasurement(kind, rawValue, displayValue);
  const referenceRange = resolveReferenceRange(label, isQualitative, patientSex);
  const status = deriveStatusDescriptor({
    rangeStatus: item.rangeStatus,
    rangeDirection: item.rangeDirection,
    color: item.color,
  });

  return {
    key,
    label,
    sectionTitle,
    kind,
    rawValue,
    units,
    valueText: formatMeasurementValue(rawValue, displayValue, units),
    referenceRangeText: referenceRange.text || normalizeText(item.referenceRangeText) || "—",
    usesSexStratifiedReference: referenceRange.isSexStratified,
    isQualitative,
    isOverridden: Boolean(item.isOverridden),
    discrepancy: Boolean(item.discrepancy),
    status,
  };
}

function normalizeMeasurementItems(items, sectionTitle = null, patientSex = null) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(item => normalizeMeasurementItem(item, sectionTitle, patientSex))
    .filter(Boolean);
}

function normalizeMeasurementSections(sections, patientSex = null) {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map(section => {
      const title = normalizeText(section?.section) || "Measurements";
      const items = normalizeMeasurementItems(section?.items, title, patientSex);

      if (items.length === 0) {
        return null;
      }

      return {
        section: title,
        items,
      };
    })
    .filter(Boolean);
}

function getMeasurementDeduplicationKey(item) {
  return item?.key || `${item?.sectionTitle || ""}:${item?.label || ""}:${item?.valueText || ""}`;
}

function filterUniqueMeasurements(items, seenKeys = new Set()) {
  if (!Array.isArray(items)) {
    return [];
  }

  const uniqueItems = [];

  items.forEach(item => {
    const dedupeKey = getMeasurementDeduplicationKey(item);

    if (seenKeys.has(dedupeKey)) {
      return;
    }

    seenKeys.add(dedupeKey);
    uniqueItems.push(item);
  });

  return uniqueItems;
}

function normalizeReportSections(sections) {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map(section => {
      const title = normalizeText(section?.title);
      const body = normalizeText(section?.body);

      if (!title && !body) {
        return null;
      }

      return {
        title,
        body,
      };
    })
    .filter(Boolean);
}

function buildMeasurementSummary(flatMeasurements) {
  const summary = {
    total: flatMeasurements.length,
    normalCount: 0,
    borderlineCount: 0,
    criticalCount: 0,
    outOfRangeCount: 0,
    editedCount: 0,
    discrepancyCount: 0,
  };

  flatMeasurements.forEach(item => {
    if (item.isOverridden) {
      summary.editedCount += 1;
    }

    if (item.discrepancy) {
      summary.discrepancyCount += 1;
    }

    if (item.status.code === "normal") {
      summary.normalCount += 1;
      return;
    }

    if (item.status.code.startsWith("borderline")) {
      summary.borderlineCount += 1;
      summary.outOfRangeCount += 1;
      return;
    }

    if (
      item.status.code === "high" ||
      item.status.code === "low" ||
      item.status.code === "abnormal"
    ) {
      summary.criticalCount += 1;
      summary.outOfRangeCount += 1;
    }
  });

  return summary;
}

function sortMeasurementsBySeverity(items) {
  return [...items].sort((left, right) => {
    if (right.status.severity !== left.status.severity) {
      return right.status.severity - left.status.severity;
    }

    if (Boolean(right.isOverridden) !== Boolean(left.isOverridden)) {
      return Number(Boolean(right.isOverridden)) - Number(Boolean(left.isOverridden));
    }

    return left.label.localeCompare(right.label);
  });
}

function buildPatientDetails(patientContext, downloadRequestedAt) {
  const formattedPatientName = formatClinicalPatientName(patientContext?.patientName);
  const examDate = formatExamDateTime({
    studyDate: patientContext?.studyDate,
    studyTime: patientContext?.studyTime,
    uploadedAt: patientContext?.uploadedAt,
    downloadRequestedAt,
  });
  const dob = formatClinicalDate(patientContext?.patientBirthDate);
  const sex = formatSexShort(patientContext?.patientSex);
  const ageYears = computeAgeYears(patientContext?.patientBirthDate, examDate || downloadRequestedAt);
  const heightCm = normalizeHeightCm(patientContext?.patientHeightCm);
  const weightKg = normalizeWeightKg(patientContext?.patientWeightKg);
  const bsa = computeBsa(heightCm, weightKg);

  return {
    displayName: formattedPatientName,
    mrn: normalizeText(patientContext?.patientId),
    dob,
    ageYears: Number.isFinite(ageYears) ? String(ageYears) : null,
    sex,
    ageSexText: formatAgeSexText(Number.isFinite(ageYears) ? String(ageYears) : null, sex),
    heightCm,
    heightText: formatHeightCm(heightCm),
    weightKg,
    weightText: formatWeightKg(weightKg),
    bsa,
    bsaText: formatBsa(bsa),
    heartRateText: formatHeartRate(patientContext?.heartRateBpm),
    referringPhysicianName: normalizeText(patientContext?.referringPhysicianName),
    sonographerName: normalizeText(patientContext?.sonographerName),
    indication: normalizeText(patientContext?.indication),
    machineName: normalizeText(patientContext?.machineName),
    accessionNumber: normalizeText(patientContext?.accessionNumber),
    examDate,
    reportStatus: "Preliminary — AI-Assisted",
  };
}

export function buildStudyResultsPdfData({
  studyUid,
  patientContext,
  downloadRequestedAt,
  studyResultsState,
  studyAnalysisCombinedResultsState,
  studyAnalysisCombinedResultsData,
  llmReportResultsState,
  llmReportResultsData,
  llmReportResultsDetail,
  studyAnalysisEditorViewModel,
}) {
  const studyAnalysisDisplay = studyAnalysisCombinedResultsData?.display ?? {};
  const patient = buildPatientDetails(patientContext, downloadRequestedAt);

  const mainMeasurements = filterUniqueMeasurements(
    normalizeMeasurementItems(
      studyAnalysisDisplay.mainMeasurements,
      "Main Measurements",
      patient.sex
    )
  );
  const seenMeasurementKeys = new Set(
    mainMeasurements.map(item => getMeasurementDeduplicationKey(item))
  );
  const measurementSections = normalizeMeasurementSections(
    studyAnalysisDisplay.measurementSections,
    patient.sex
  )
    .map(section => ({
      ...section,
      items: filterUniqueMeasurements(section.items, seenMeasurementKeys),
    }))
    .filter(section => section.items.length > 0);

  const flatMeasurements = [
    ...mainMeasurements,
    ...measurementSections.flatMap(section => section.items),
  ];
  const measurementSummary = buildMeasurementSummary(flatMeasurements);
  const sortedFlatMeasurements = sortMeasurementsBySeverity(flatMeasurements);
  const hasSexStratifiedReferences = flatMeasurements.some(
    item => item.usesSexStratifiedReference
  );

  return {
    studyUid: normalizeText(studyUid),
    patientName: patient.displayName,
    patient,
    downloadedAt: normalizeFormattedDate(formatDateTime(downloadRequestedAt)),
    studyResultsState: studyResultsState ?? "idle",

    aiMeasurements: {
      state: studyAnalysisCombinedResultsState ?? "idle",
      totalMeasurements: measurementSummary.total,
      mainMeasurements,
      measurementSections,
      flatMeasurements,
      summary: measurementSummary,
      outliers: sortedFlatMeasurements.filter(item => item.status.severity > 0),
      showSexReferenceNote: !patient.sex && hasSexStratifiedReferences,
    },

    aiReport: {
      state: llmReportResultsState ?? "idle",
      detail: normalizeText(llmReportResultsDetail),
      mainTitle: normalizeText(llmReportResultsData?.mainTitle),
      sections: normalizeReportSections(llmReportResultsData?.sections),
      reportGeneratedAt: normalizeFormattedDate(
        llmReportResultsData?.reportGeneratedAt
      ),
    },

    editState: {
      hasOverrides: Boolean(
        studyAnalysisEditorViewModel?.hasStudyAnalysisOverrides
      ),
      overridesUpdatedAt: normalizeFormattedDate(
        studyAnalysisEditorViewModel?.studyAnalysisOverridesUpdatedAt
      ),
      isReportStale: Boolean(studyAnalysisEditorViewModel?.isAiReportStale),
    },
  };
}
