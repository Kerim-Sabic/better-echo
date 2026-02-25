import dicomParser from "dicom-parser";

// Safely pick DICOM tags
export function pickTags(meta) {
  const tags = meta || {};
  return {
    PatientName: tags.PatientName || tags["0010,0010"] || "",
    PatientID: tags.PatientID || tags["0010,0020"] || "",
    PatientBirthDate: tags.PatientBirthDate || tags["0010,0030"] || "",
    PatientSex: tags.PatientSex || tags["0010,0040"] || "",
    PatientSize: tags.PatientSize || tags["0010,1020"] || "",
    PatientWeight: tags.PatientWeight || tags["0010,1030"] || "",
    HeartRate: tags.HeartRate || tags["0018,1088"] || "",
    StudyDate: tags.StudyDate || tags["0008,0020"] || "",
    StudyTime: tags.StudyTime || tags["0008,0030"] || "",
    AccessionNumber: tags.AccessionNumber || tags["0008,0050"] || "",
    ReferringPhysicianName: tags.ReferringPhysicianName || tags["0008,0090"] || "",
  };
}

// Function to retrieve StudyUID from a dicom instance file
export function getStudyUID(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result;
        const dataSet = dicomParser.parseDicom(new Uint8Array(arrayBuffer));
        const studyUID = dataSet.string("x0020000d");
        resolve(studyUID);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
