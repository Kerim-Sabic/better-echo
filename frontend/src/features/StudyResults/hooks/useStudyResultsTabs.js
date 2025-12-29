import { useEffect, useState } from "react";

export function useStudyResultsTabs(studyUid) {
  // ---- UI state -----------------------------------------------------------
  const [activeTab, setActiveTab] = useState("measurements");

  useEffect(() => {
    setActiveTab("measurements");
  }, [studyUid]);

  return { activeTab, setActiveTab };
}
