import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadDicomApi } from "../../../api/upload_dicom/uploadDicomApi";
import { pickTags, getStudyUID } from "../utils";

export function useNewStudy() {
    const navigate = useNavigate();

    const [files, setFiles] = useState([]);
    const [isUploading, setUploading] = useState(false);
    const [status, setStatus] = useState("");
    const [studyUID, setStudyUID] = useState(null);
    const [instanceIds, setInstanceIds] = useState([]);
    const [tags, setTags] = useState(null);
    const [duplicatesFiles, setDuplicateFiles] = useState([]);

    const handleUpload = async () => {
        if (!files.length) return;
        setUploading(true);
        setStatus("Uploading DICOM files...");

        try {
            let firstUID = null;

            for (const file of files) {
                const uid = await getStudyUID(file);
                if (!uid) throw new Error(`Cannot read StudyUID for file ${file.name}`);

                if (!firstUID) firstUID = uid;
                else if (firstUID !== uid) {
                    throw new Error(`File ${file.name} belongs to a different study. All files must belong to the same study.`);
                }
            }

            setStatus("All files verified. Uploading...");

            const uploadedInstanceIds = [];
            let mergedTags = null;
            const duplicates = [];
            let resolvedStudyUID = firstUID;

            for (const file of files) {
                try {
                    const data = await uploadDicomApi(file);
                    const { study_uid, sop_instance_uid, tags: dicomTags } = data || {};
                    if (study_uid) resolvedStudyUID = study_uid;
                    if (sop_instance_uid) uploadedInstanceIds.push(sop_instance_uid);
                    if (!mergedTags && dicomTags) mergedTags = pickTags(dicomTags);
                } catch (err) {
                    const detailMessage = err.response?.data?.detail || err.message || "";
                    if (detailMessage.includes("already been uploaded")) {
                        duplicates.push(file.name);
                    } else {
                        console.error(`Failed to upload ${file.name}`, err);
                        setStatus(`Upload failed for ${file.name}: ${detailMessage}`);
                        throw err;
                    }
                }
            }

            setDuplicateFiles(duplicates);
            setStudyUID(resolvedStudyUID);
            setInstanceIds(uploadedInstanceIds);

            if (mergedTags) {
                setTags(mergedTags);
            }

            setStatus(`Upload complete. ${files.length} files processed.`);
        } catch (err) {
            console.error(err);
            const detailMessage = err.response?.data?.detail;
            setStatus(`Upload failed: ${detailMessage || err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const createStudyAndAnalyze = () => {
        if (!studyUID) {
            setStatus("Please upload DICOM files first.");
            return;
        }
        if (!instanceIds.length) {
            setStatus("No instances uploaded. Try uploading again.");
            return;
        }
        navigate(`/studies/${encodeURIComponent(studyUID)}`, {
            state: { study_uid: studyUID, instance_id: instanceIds },
        });
    };

    return {
        files,
        setFiles,
        isUploading,
        status,
        studyUID,
        instanceIds,
        tags,
        duplicatesFiles,
        handleUpload,
        createStudyAndAnalyze,
        setTags,
    };
}
