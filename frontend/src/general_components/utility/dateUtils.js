export const formatDateTime = (value) => {
  if (!value) return "N/A";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false, // set true if you prefer AM/PM
  }).format(date);
};

export const formatStudyDate = (studyDateValue) => {
  if (!studyDateValue) return "N/A";

  const rawStudyDate = String(studyDateValue).trim();
  if (!/^\d{8}$/.test(rawStudyDate)) return "N/A";

  const year = rawStudyDate.slice(0, 4);
  const month = rawStudyDate.slice(4, 6);
  const day = rawStudyDate.slice(6, 8);

  return `${day}-${month}-${year}`;
};
