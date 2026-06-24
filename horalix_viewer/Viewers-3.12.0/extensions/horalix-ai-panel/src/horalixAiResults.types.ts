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
export type HoralixOverlayViewport = {
  viewportId: string;
  viewportIndex: number;
  viewportLabel?: string | null;
  sopInstanceUid?: string | null;
  currentFrameIndex?: number | null;
};

export type HoralixOverlayRle = {
  size?: number[];
  counts?: number[];
};

export type HoralixOverlayFrame = {
  frameIndex?: number | null;
  rle?: HoralixOverlayRle | null;
  present?: boolean;
  confidence?: number | null;
  areaPx?: number | null;
  points?: HoralixOverlayPoint[];
  segments?: HoralixOverlaySegment[];
  measurement?: HoralixOverlayMeasurement | null;
};

export type HoralixOverlayPoint = {
  id?: string | null;
  x?: number | null;
  y?: number | null;
  confidence?: number | null;
};

export type HoralixOverlaySegment = {
  from?: string | null;
  to?: string | null;
  role?: string | null;
};

export type HoralixOverlayMeasurement = {
  name?: string | null;
  value?: number | null;
  units?: string | null;
  lengthPx?: number | null;
};

export type HoralixOverlayReferenceLine = {
  y?: number | null;
  relativeY?: number | null;
  role?: string | null;
};

export type HoralixOverlayDocument = {
  schemaVersion?: number | null;
  overlayType?: string | null;
  overlayKey?: string | null;
  kind?: string | null;
  sopInstanceUid?: string | null;
  instanceId?: number | null;
  modelName?: string | null;
  modelVersion?: string | null;
  frameCount?: number | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  fps?: number | null;
  coordinateSpace?: string | null;
  geometryType?: string | null;
  selectedFrameIndex?: number | null;
  maskFormat?: string | null;
  maskResolution?: number[];
  points?: HoralixOverlayPoint[];
  segments?: HoralixOverlaySegment[];
  frames?: HoralixOverlayFrame[];
  measurement?: HoralixOverlayMeasurement | null;
  referenceLine?: HoralixOverlayReferenceLine | null;
  dopplerRegion?: Record<string, unknown>;
  frameSelection?: Record<string, unknown>;
  quality?: Record<string, unknown>;
};

export type HoralixLvOverlayDocument = HoralixOverlayDocument;
export type HoralixPointLineFrame = HoralixOverlayFrame;
export type HoralixPointLineOverlayDocument = HoralixOverlayDocument;

export type HoralixAiOverlay = {
  sopInstanceUid?: string | null;
  overlayType?: string | null;
  overlayKey?: string | null;
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
  geometryType?: string | null;
  maskFormat?: string | null;
  meanConfidence?: number | null;
  framesWithMask?: number | null;
  measurementName?: string | null;
  measurementValue?: number | null;
  measurementUnits?: string | null;
  displayName?: string | null;
  familyLabel?: string | null;
  summaryValueLabel?: string | null;
  summaryValueKind?: string | null;
  confidenceScore?: number | null;
  confidenceSource?: string | null;
  confidenceThreshold?: number | null;
  lowConfidence?: boolean;
  warnings?: string[];
  generatedAt?: string | null;
  payloadUrl?: string | null;
  document?: HoralixOverlayDocument | null;
};

export type HoralixAiOverlayInstanceSummary = {
  sopInstanceUid?: string | null;
  instanceId?: number | null;
  predictedView?: string | null;
  predictedViewLabel?: string | null;
  predictedViewConfidence?: number | null;
  overlayStatus?: string | null;
  overlayCount?: number | null;
  availableOverlayCount?: number | null;
  runningOverlayCount?: number | null;
  failedOverlayCount?: number | null;
  lowConfidenceCount?: number | null;
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
  aiOverlayInstances?: HoralixAiOverlayInstanceSummary[];
};
