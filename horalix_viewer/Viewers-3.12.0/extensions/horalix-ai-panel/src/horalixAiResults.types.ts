// PANECHO ECHOPRIME MEASUREMENTS
export type MeasurementItem = {
  key?: string;
  label?: string;
  kind?: string;
  displayValue?: string | number | null;
  units?: string | null;
  color?: string | null;
  discrepancy?: boolean;
  editType?: string | null;
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
  llmReportResultsState?: string | null;
  llmReportResultsDetail?: string | null;
  llmEchoReport?: HoralixLlmEchoReport | null;
};
