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

export type HoralixAiResultsPayload = {
  sentAt?: string | null;
  studyUid?: string | null;
  studyAnalysisCombinedResultsState?: string | null;
  studyAnalysisMeasurements?: HoralixAiMeasurements | null;
};
