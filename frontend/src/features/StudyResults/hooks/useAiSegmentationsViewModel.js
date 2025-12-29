export function useAiSegmentationsViewModel({ state, dynamicMeasurementsResults }) {
  // ---- AI segmentations view model ---------------------------------------
  const instances = dynamicMeasurementsResults?.instances || [];
  const hasInstances = Array.isArray(instances) && instances.length > 0;

  return {
    state,
    showLoading: state !== "ready",
    isEmpty: !hasInstances,
    instances,
    totalInstances: hasInstances ? instances.length : 0,
  };
}
