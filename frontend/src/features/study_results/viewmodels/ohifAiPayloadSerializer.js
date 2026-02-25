const OHIF_MESSAGE_VERSION = 1;

function buildAiMeasurementsPayload(aiMeasurements) {
  if (!aiMeasurements || typeof aiMeasurements !== "object") {
    return null;
  }

  const {
    state,
    showLoading,
    isEmpty,
    totalMeasurements,
    mainMeasurements,
    Measurements,
    hasMainMeasurements,
    hasMeasurements,
    isIndexedMode,
    canIndex,
    bsa,
  } = aiMeasurements;

  return {
    state,
    showLoading,
    isEmpty,
    totalMeasurements,
    mainMeasurements,
    Measurements,
    hasMainMeasurements,
    hasMeasurements,
    isIndexedMode,
    canIndex,
    bsa,
  };
}

function buildAiVideoMeasurementsPayload(aiVideoMeasurements) {
  if (!aiVideoMeasurements || typeof aiVideoMeasurements !== "object") {
    return null;
  }

  const { state, showLoading, isEmpty, instances, totalInstances } = aiVideoMeasurements;

  return {
    state,
    showLoading,
    isEmpty,
    instances,
    totalInstances,
  };
}

export function buildStudyResultsOhifAiPayload(viewModel) {
  return {
    version: OHIF_MESSAGE_VERSION,
    sentAt: new Date().toISOString(),
    studyUID: viewModel?.studyUID ?? null,
    state: viewModel?.state ?? "loading",
    panEchoEchoprimeState: viewModel?.panEchoEchoprimeState,
    dynamicMeasurementsState: viewModel?.dynamicMeasurementsState,
    aiMeasurements: buildAiMeasurementsPayload(viewModel?.aiMeasurements),
    aiVideoMeasurements: buildAiVideoMeasurementsPayload(viewModel?.aiVideoMeasurements),
    patientName: viewModel?.patientName ?? null,
    patientSex: viewModel?.patientSex ?? null,
    hasOverrides: Boolean(viewModel?.hasOverrides),
    latestOverrideAt: viewModel?.latestOverrideAt ?? null,
  };
}
