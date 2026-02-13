import { useQuery } from "@tanstack/react-query";
import { getStudyByUidApi } from "../../../../api/StudiesApi";

/**
 * React Query hook that fetches the
 * Metadata for the given study.
 */

export function useStudyMetaQuery(studyUid, { enabled = true, queryKeyPrefix = "studyMeta" } = {}) {
    return useQuery({
        // cache key is per study
        queryKey: [queryKeyPrefix, studyUid],
        enabled: Boolean(enabled && studyUid),
        queryFn: () => getStudyByUidApi(studyUid),
        // derive a UI-friendly shape
        select: (data) => ({
            data,
            patientName: data?.patient?.patient_name || null,
            patientSex: data?.patient?.patient_sex || null,
            patientHeightCm: data?.patient_height_cm ?? null,
            patientWeightKg: data?.patient_weight_kg ?? null,
            heartRateBpm: data?.heart_rate_bpm ?? null,
        }),
    });
}

// useQuery(...) returns a Query Result object with many fields.
/**
{
  data?: { data, patientName, patientSex }, // transformed by select
  isLoading: boolean,
  isFetching: boolean,
  isError: boolean,
  error: unknown,
  refetch: () => Promise<...>,
  // ...plus other fields (status, fetchStatus, etc.)
}
*/
