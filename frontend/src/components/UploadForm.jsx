// src/components/UploadForm.jsx
import React, { useState } from 'react';
import axios from 'axios';
import Viewer from './Viewer';

export default function UploadForm() {
    const [file, setFile] = useState(null);
    const [studyUID, setStudyUID] = useState(null);
    const [status, setStatus] = useState('');
    const [instanceId, setInstanceId] = useState(null);
    const [ef, setEf] = useState(null);
    const [isUploading, setIsUploading] = useState(false);


    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setIsUploading(true);
        setStatus('Uploading...');
        setEf(null);

        try {
            const { data } = await axios.post('http://localhost:8000/upload-dicom', formData);
            const { study_uid, instance_id } = data || {};

            if (!study_uid || study_uid === 'Unknown') {
                setStatus('Upload ok, but StudyInstanceUID missing.');
                setIsUploading(false);
                return;
            }

            setStudyUID(study_uid);
            setInstanceId(instance_id || null);
            setStatus('Uploaded successfully! Running EF…');

            try {
                const efRes = await axios.get('http://localhost:8000/infer/ef', {
                    params: study_uid ? { study_uid } : { instance_id },
                });
                const val = efRes?.data?.ef;
                if (typeof val === 'number') {
                    setEf(val);
                    setStatus(`Uploaded. EF: ${val.toFixed(1)}%`);
                } else {
                    setStatus('Uploaded. EF not available.');
                }
            } catch (e) {
                setStatus('Uploaded. EF inference failed.');
            }
        } catch (e) {
            console.error(e);
            setStatus('Upload failed.');
        }finally {
            setIsUploading(false);
        }
    };

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div>
                <input type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
                <button onClick={handleUpload} disabled={!file || isUploading}>
                    {isUploading ? 'Uploading…' : 'Upload'}
                </button>
                <span style={{ marginLeft: 8 }}>{status}</span>
                {ef != null && (
                    <span style={{ marginLeft: 8, fontWeight: 600 }}>
            EF: {ef.toFixed(1)}%
          </span>
                )}

                {/* Show Instance ID if available */}
                {instanceId && (
                    <div style={{ marginTop: 8, fontSize: '0.9em', color: '#555' }}>
                        Instance ID: {instanceId}
                    </div>
                )}

            </div>

            {/* Keep showing the viewer for the uploaded study */}
            <Viewer studyUID={studyUID} />
        </div>
    );
}



