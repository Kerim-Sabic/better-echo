/**
 * Formats a DICOM-style study date (`YYYYMMDD`) into UI format (`DD-MM-YYYY`).
 *
 * Returns `"N/A"` if value is missing or not exactly 8 digits.
 *
 * @param {string|number|null|undefined} dicomTagStudyDate - Raw study date, usually from DICOM metadata.
 * @returns {string} Formatted date string in `DD-MM-YYYY` format, or `"N/A"`.
 *
 * @example
 * formatDicomTagStudyDate("20250813");
 * // "13-08-2025"
 *
 * @example
 * formatDicomTagStudyDate(20180720);
 * // "20-07-2018"
 *
 * @example
 * formatDicomTagStudyDate("2025-08-13");
 * // "N/A"
 */
export const formatDicomTagStudyDate = dicomTagStudyDate => {
  if (!dicomTagStudyDate) return "N/A";

  const rawStudyDate = String(dicomTagStudyDate).trim();
  if (!/^\d{8}$/.test(rawStudyDate)) return "N/A";

  const year = rawStudyDate.slice(0, 4);
  const month = rawStudyDate.slice(4, 6);
  const day = rawStudyDate.slice(6, 8);

  return `${day}-${month}-${year}`;
};

/**
 * Formats a DICOM-style study time (`HHMMSS` or `HHMMSS.frac`) into UI format.
 *
 * Returns `"N/A"` if value is missing or invalid.
 *
 * @param {string|number|null|undefined} dicomTagStudyTime - Raw study time from DICOM metadata.
 * @returns {string} Formatted time string (`HH:MM:SS`), or `"N/A"`.
 *
 * @example
 * formatDicomTagStudyTime("141620");
 * // "14:16:20"
 *
 * @example
 * formatDicomTagStudyTime("141620.123");
 * // "14:16:20"
 *
 * @example
 * formatDicomTagStudyTime("1416");
 * // "14:16:00"
 */
export const formatDicomTagStudyTime = dicomTagStudyTime => {
  if (!dicomTagStudyTime) return "N/A";

  const rawStudyTime = String(dicomTagStudyTime).trim();
  const mainTimePart = rawStudyTime.split(".")[0];
  const digits = mainTimePart.replace(/\D/g, "");

  if (digits.length < 4) return "N/A";

  const hours = digits.slice(0, 2);
  const minutes = digits.slice(2, 4);
  const seconds = digits.length >= 6 ? digits.slice(4, 6) : "00";

  const h = Number(hours);
  const m = Number(minutes);
  const s = Number(seconds);

  if (
    !Number.isInteger(h) ||
    !Number.isInteger(m) ||
    !Number.isInteger(s) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59 ||
    s < 0 ||
    s > 59
  ) {
    return "N/A";
  }

  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Formats DICOM PatientSex values into UI labels.
 *
 * @param {string|null|undefined} dicomTagPatientSex - Raw DICOM sex code (e.g. "M", "F", "O", "U").
 * @returns {string} UI label (e.g. "Male"), or "N/A" when missing.
 *
 * @example
 * formatDicomTagPatientSex("M"); // "Male"
 * formatDicomTagPatientSex("F"); // "Female"
 * formatDicomTagPatientSex("U"); // "Unknown"
 */
export const formatDicomTagPatientSex = dicomTagPatientSex => {
  if (!dicomTagPatientSex) return "N/A";

  const sex = String(dicomTagPatientSex).trim().toUpperCase();

  if (sex === "M") return "Male";
  if (sex === "F") return "Female";
  if (sex === "O") return "Other";
  if (sex === "U") return "Unknown";

  return dicomTagPatientSex;
};
