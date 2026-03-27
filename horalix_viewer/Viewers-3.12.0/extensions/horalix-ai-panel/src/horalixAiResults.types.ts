// PANECHO ECHOPRIME MEASUREMENTS
export type MeasurementItem = {
  key?: string;
  label?: string;
  kind?: 'numeric' | 'categorical' | string;
  displayValue?: string | number | null;
  rawValue?: number | null;
  units?: string | null;
  probabilities?: Record<string, number> | null;
  color?: string | null;
  rangeStatus?: 'normal' | 'borderline' | 'abnormal' | string | null;
  referenceRangeText?: string | null;
  rangeDirection?: 'high' | 'low' | 'normal' | string | null;
  discrepancy?: boolean;
  isOverridden?: boolean;
  editable?: boolean;
  editType?: 'label' | 'value' | string | null;
  editOptions?: string[] | null;
};

export type MeasurementSection = {
  section?: string;
  items?: MeasurementItem[];
};

export type HoralixAiMeasurements = {
  mainMeasurements?: MeasurementItem[];
  measurementSections?: MeasurementSection[];
  totalMeasurements?: number | null;
};

export type HoralixPanechoEchoprimeEditorState = {
  hasOverrides?: boolean;
  overridesUpdatedAt?: string | null;
  isReportStale?: boolean;
  canRegenerateAiReport?: boolean;
  isRegeneratingAiReport?: boolean;
  regenerateAiReportErrorMessage?: string | null;
};

// LLM ECHO REPORT
export type HoralixLlmReportSection = {
  title?: string | null;
  body?: string | null;
};

export type HoralixLlmEchoReport = {
  mainTitle?: string | null;
  sections?: HoralixLlmReportSection[];
  reportGeneratedAt?: string | null;
};

// COMBINED PAYLOAD
export type HoralixAiResultsPayload = {
  sentAt?: string | null;
  studyUid?: string | null;
  panechoEchoprimeCombinedResultsState?: string | null;
  panechoEchoprimeAiMeasurements?: HoralixAiMeasurements | null;
  panechoEchoprimeEditorState?: HoralixPanechoEchoprimeEditorState | null;
  llmReportResultsState?: string | null;
  llmReportResultsDetail?: string | null;
  llmEchoReport?: HoralixLlmEchoReport | null;
};
