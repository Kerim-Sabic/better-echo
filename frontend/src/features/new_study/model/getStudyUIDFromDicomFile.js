import dicomParser from "dicom-parser";

// Function to retrieve StudyUID from a dicom instance file
export function getStudyUIDFromDicomFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const arrayBuffer = reader.result;
        const dataSet = dicomParser.parseDicom(new Uint8Array(arrayBuffer));
        const studyUID = dataSet.string("x0020000d");
        resolve(studyUID);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
