import { formatDateTime } from "@/general_components/utility/dateUtils";

function normalizeFormattedDate(value) {
  return typeof value === "string" && value.trim() && value !== "N/A"
    ? value
    : null;
}

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return String(Number(value.toFixed(2)));
}

const UNIT_DISPLAY_MAP = {
  "cm^3": "mL",
  "cm3": "mL",
  "cm**3": "mL",
};

function normalizeUnitForDisplay(unit) {
  if (!unit) {
    return unit;
  }

  return UNIT_DISPLAY_MAP[unit] || unit;
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
    return "-";
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
      direction: "normal",
      severity: 0,
    };
  }

  if (normalizedRangeStatus === "borderline") {
    if (normalizedDirection === "high") {
      return {
        code: "borderline_high",
        label: "Borderline High",
        direction: "high",
        severity: 1,
      };
    }

    if (normalizedDirection === "low") {
      return {
        code: "borderline_low",
        label: "Borderline Low",
        direction: "low",
        severity: 1,
      };
    }

    return {
      code: "borderline",
      label: "Borderline",
      direction: null,
      severity: 1,
    };
  }

  if (normalizedRangeStatus === "abnormal") {
    if (normalizedDirection === "high") {
      return {
        code: "high",
        label: "High",
        direction: "high",
        severity: 2,
      };
    }

    if (normalizedDirection === "low") {
      return {
        code: "low",
        label: "Low",
        direction: "low",
        severity: 2,
      };
    }

    return {
      code: "abnormal",
      label: "Abnormal",
      direction: null,
      severity: 2,
    };
  }

  if (normalizedColor === "green") {
    return {
      code: "normal",
      label: "Normal",
      direction: "normal",
      severity: 0,
    };
  }

  if (normalizedColor === "yellow") {
    return {
      code: "borderline",
      label: "Borderline",
      direction: null,
      severity: 1,
    };
  }

  if (normalizedColor === "red") {
    return {
      code: "abnormal",
      label: "Abnormal",
      direction: null,
      severity: 2,
    };
  }

  return {
    code: "unknown",
    label: "No Reference",
    direction: null,
    severity: -1,
  };
}

function normalizeMeasurementItem(item, sectionTitle = null) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const key = normalizeText(item.key);
  const label = normalizeText(item.shortName) || normalizeText(item.label) || key || "Measurement";
  const kind = normalizeText(item.kind) || "numeric";
  const units = normalizeUnitForDisplay(normalizeText(item.units));
  const rawValue = Number.isFinite(item.rawValue) ? Number(item.rawValue) : null;
  const displayValue = item.displayValue;
  const referenceRangeText = normalizeText(item.referenceRangeText);
  const notes = [];

  if (item.isOverridden) {
    notes.push("Edited");
  }

  if (item.discrepancy) {
    notes.push("Discrepancy");
  }

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
    referenceRangeText,
    notes,
    notesText: notes.length > 0 ? notes.join(", ") : "None",
    isOverridden: Boolean(item.isOverridden),
    discrepancy: Boolean(item.discrepancy),
    status,
  };
}

function normalizeMeasurementItems(items, sectionTitle = null) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(item => normalizeMeasurementItem(item, sectionTitle))
    .filter(Boolean);
}

function normalizeMeasurementSections(sections) {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map(section => {
      const title = normalizeText(section?.section) || "Measurements";
      const items = normalizeMeasurementItems(section?.items, title);

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

    if (item.status.code === "high" || item.status.code === "low" || item.status.code === "abnormal") {
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

export function buildStudyResultsPdfData({
  studyUid,
  downloadRequestedAt,
  studyResultsState,
  panechoEchoprimeCombinedResultsState,
  panechoEchoprimeCombinedResultsData,
  llmReportResultsState,
  llmReportResultsData,
  llmReportResultsDetail,
  panechoEchoprimeEditorViewModel,
}) {
  const panechoDisplay = panechoEchoprimeCombinedResultsData?.display ?? {};

  const mainMeasurements = filterUniqueMeasurements(
    normalizeMeasurementItems(panechoDisplay.mainMeasurements, "Key Measurements")
  );
  const seenMeasurementKeys = new Set(
    mainMeasurements.map(item => getMeasurementDeduplicationKey(item))
  );
  const measurementSections = normalizeMeasurementSections(panechoDisplay.measurementSections)
    .map(section => ({
      ...section,
      items: filterUniqueMeasurements(section.items, seenMeasurementKeys),
    }))
    .filter(section => section.items.length > 0);
  const flatMeasurements = [...mainMeasurements, ...measurementSections.flatMap(section => section.items)];
  const measurementSummary = buildMeasurementSummary(flatMeasurements);
  const sortedMainMeasurements = sortMeasurementsBySeverity(mainMeasurements);
  const sortedFlatMeasurements = sortMeasurementsBySeverity(flatMeasurements);

  return {
    studyUid: normalizeText(studyUid),
    downloadedAt: normalizeFormattedDate(formatDateTime(downloadRequestedAt)),
    studyResultsState: studyResultsState ?? "idle",

    aiMeasurements: {
      state: panechoEchoprimeCombinedResultsState ?? "idle",
      totalMeasurements: measurementSummary.total,
      mainMeasurements,
      measurementSections,
      flatMeasurements,
      summary: measurementSummary,
      highlights:
        sortedMainMeasurements.length > 0
          ? sortedMainMeasurements.slice(0, 6)
          : sortedFlatMeasurements.slice(0, 6),
      outliers: sortMeasurementsBySeverity(
        flatMeasurements.filter(item => item.status.severity > 0)
      ).slice(0, 10),
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
        panechoEchoprimeEditorViewModel?.hasPanechoEchoprimeOverrides
      ),
      overridesUpdatedAt: normalizeFormattedDate(
        panechoEchoprimeEditorViewModel?.panechoEchoprimeOverridesUpdatedAt
      ),
      isReportStale: Boolean(panechoEchoprimeEditorViewModel?.isAiReportStale),
    },
  };
}
