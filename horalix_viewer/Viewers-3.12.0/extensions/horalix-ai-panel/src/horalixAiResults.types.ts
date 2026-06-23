// STUDY ANALYSIS MEASUREMENTS
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

export type HoralixStudyAnalysisEditorState = {
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

// AI OVERLAY LAYER
export type HoralixOverlayRle = {
  size?: number[];
  counts?: number[];
};

export type HoralixOverlayFrame = {
  rle?: HoralixOverlayRle | null;
  present?: boolean;
  confidence?: number | null;
  areaPx?: number | null;
};

export type HoralixLvOverlayDocument = {
  schemaVersion?: number | null;
  kind?: string | null;
  sopInstanceUid?: string | null;
  instanceId?: number | null;
  modelName?: string | null;
  modelVersion?: string | null;
  frameCount?: number | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  fps?: number | null;
  maskFormat?: string | null;
  maskResolution?: number[];
  frames?: HoralixOverlayFrame[];
};

export type HoralixAiOverlay = {
  sopInstanceUid?: string | null;
  overlayType?: string | null;
  kind?: string | null;
  structured?: boolean;
  status?: string | null;
  available?: boolean;
  modelName?: string | null;
  modelVersion?: string | null;
  frameCount?: number | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  fps?: number | null;
  maskFormat?: string | null;
  meanConfidence?: number | null;
  framesWithMask?: number | null;
  warnings?: string[];
  generatedAt?: string | null;
  payloadUrl?: string | null;
  document?: HoralixLvOverlayDocument | null;
};

// COMBINED PAYLOAD
export type HoralixAiResultsPayload = {
  sentAt?: string | null;
  studyUid?: string | null;
  studyAnalysisCombinedResultsState?: string | null;
  studyAnalysisMeasurements?: HoralixAiMeasurements | null;
  studyAnalysisEditorState?: HoralixStudyAnalysisEditorState | null;
  llmReportEnabled?: boolean;
  llmReportResultsState?: string | null;
  llmReportResultsDetail?: string | null;
  llmEchoReport?: HoralixLlmEchoReport | null;
  apiBaseUrl?: string | null;
  aiOverlaysState?: string | null;
  aiOverlays?: HoralixAiOverlay[];
};
