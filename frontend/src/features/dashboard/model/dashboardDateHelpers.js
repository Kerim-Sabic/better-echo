const pad2 = value => String(value).padStart(2, "0");

function parseStudyDateValue(rawStudyDate) {
  if (!rawStudyDate) {
    return null;
  }

  const studyDateString = String(rawStudyDate).trim();

  // DICOM date format: YYYYMMDD
  if (/^\d{8}$/.test(studyDateString)) {
    const year = Number(studyDateString.slice(0, 4));
    const month = Number(studyDateString.slice(4, 6));
    const day = Number(studyDateString.slice(6, 8));
    const parsedDate = new Date(year, month - 1, day);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  // Fallback for ISO-like values
  const parsedDate = new Date(studyDateString);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function parseUploadedAtValue(rawUploadedAt) {
  if (!rawUploadedAt) {
    return null;
  }

  const parsedDate = new Date(rawUploadedAt);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDate(date) {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDateTime(date) {
  const datePart = formatDate(date);
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${datePart} ${hours}:${minutes}`;
}

export function formatStudyDateForUi(rawStudyDate) {
  const parsedStudyDate = parseStudyDateValue(rawStudyDate);
  return parsedStudyDate ? formatDate(parsedStudyDate) : "-";
}

export function formatUploadedAtForUi(rawUploadedAt) {
  const parsedUploadedAt = parseUploadedAtValue(rawUploadedAt);
  return parsedUploadedAt ? formatDateTime(parsedUploadedAt) : "-";
}
