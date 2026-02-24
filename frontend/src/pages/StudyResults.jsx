import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StudyResultsLayout } from "../features/StudyResults/layouts/StudyResultsLayout";
import { useStudyResults } from "../features/StudyResults/hooks/useStudyResults";

const OHIF_MESSAGE_VERSION = 1;

function toBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

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

export default function StudyResultsPage() {
  const { studyUid } = useParams();
  const navigate = useNavigate();

  const viewModel = useStudyResults(studyUid);

  const enableOhifAiPanel = toBooleanFlag(process.env.REACT_APP_ENABLE_OHIF_AI_PANEL, false);

  const aiMeasurementsPayload = useMemo(
    () => buildAiMeasurementsPayload(viewModel?.aiMeasurements),
    [viewModel?.aiMeasurements]
  );

  const aiVideoMeasurementsPayload = useMemo(
    () => buildAiVideoMeasurementsPayload(viewModel?.aiVideoMeasurements),
    [viewModel?.aiVideoMeasurements]
  );

  const ohifAiPayload = useMemo(
    () => ({
      version: OHIF_MESSAGE_VERSION,
      sentAt: new Date().toISOString(),
      studyUID: viewModel?.studyUID ?? null,
      state: viewModel?.state ?? "loading",
      panEchoEchoprimeState: viewModel?.panEchoEchoprimeState,
      dynamicMeasurementsState: viewModel?.dynamicMeasurementsState,
      aiMeasurements: aiMeasurementsPayload,
      aiVideoMeasurements: aiVideoMeasurementsPayload,
      patientName: viewModel?.patientName ?? null,
      patientSex: viewModel?.patientSex ?? null,
      hasOverrides: Boolean(viewModel?.hasOverrides),
      latestOverrideAt: viewModel?.latestOverrideAt ?? null,
    }),
    [
      viewModel?.studyUID,
      viewModel?.state,
      viewModel?.panEchoEchoprimeState,
      viewModel?.dynamicMeasurementsState,
      aiMeasurementsPayload,
      aiVideoMeasurementsPayload,
      viewModel?.patientName,
      viewModel?.patientSex,
      viewModel?.hasOverrides,
      viewModel?.latestOverrideAt,
    ]
  );

  return (
    <StudyResultsLayout
      navigateBack={() => navigate("/dashboard")}
      viewModel={viewModel}
      useOhifAiPanel={enableOhifAiPanel}
      ohifAiPayload={ohifAiPayload}
    />
  );
}
