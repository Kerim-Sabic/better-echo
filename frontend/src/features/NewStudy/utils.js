import dicomParser from "dicom-parser";

// Safely pick DICOM tags
export function pickTags(meta) {
  const t = meta || {};
  return {
    PatientName: t.PatientName || t["0010,0010"] || "",
    PatientID: t.PatientID || t["0010,0020"] || "",
    PatientBirthDate: t.PatientBirthDate || t["0010,0030"] || "",
    StudyDate: t.StudyDate || t["0008,0020"] || "",
    StudyTime: t.StudyTime || t["0008,0030"] || "",
    AccessionNumber: t.AccessionNumber || t["0008,0050"] || "",
    ReferringPhysicianName: t.ReferringPhysicianName || t["0008,0090"] || "",
  };
}

export function upsertStudyToLocalStorage(study) {
  try {
    const raw = localStorage.getItem("studies");
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((s) => s.id === study.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...study };
    else list.unshift(study);
    localStorage.setItem("studies", JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}


// Function to retrieve StudyUID from a dicom instance file
export function getStudyUID(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result;
        const dataSet = dicomParser.parseDicom(new Uint8Array(arrayBuffer));
        const studyUID = dataSet.string("x0020000d"); // StudyUID tag
        resolve(studyUID)
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}