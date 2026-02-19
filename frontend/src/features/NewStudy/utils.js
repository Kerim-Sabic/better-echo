import dicomParser from "dicom-parser";

// Safely pick DICOM tags
export function pickTags(meta) {
    const t = meta || {};
    return {
        PatientName: t.PatientName || t["0010,0010"] || "",
        PatientID: t.PatientID || t["0010,0020"] || "",
        PatientBirthDate: t.PatientBirthDate || t["0010,0030"] || "",
        PatientSex: t.PatientSex || t["0010,0040"] || "",
        PatientSize: t.PatientSize || t["0010,1020"] || "",
        PatientWeight: t.PatientWeight || t["0010,1030"] || "",
        HeartRate: t.HeartRate || t["0018,1088"] || "",
        StudyDate: t.StudyDate || t["0008,0020"] || "",
        StudyTime: t.StudyTime || t["0008,0030"] || "",
        AccessionNumber: t.AccessionNumber || t["0008,0050"] || "",
        ReferringPhysicianName: t.ReferringPhysicianName || t["0008,0090"] || "",
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
