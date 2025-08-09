// src/components/UploadForm.jsx
import React, { useState } from 'react';
import axios from 'axios';
import Viewer from './Viewer';

export default function UploadForm() {
    const [file, setFile] = useState(null);
    const [studyUID, setStudyUID] = useState(null);
    const [status, setStatus] = useState('');

    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setStatus('Uploading...');
        try {
            const { data } = await axios.post('http://localhost:8000/upload-dicom', formData);
            const { study_uid } = data;
            if (!study_uid || study_uid === 'Unknown') {
                setStatus('Upload ok, but StudyInstanceUID missing.');
                return;
            }
            setStudyUID(study_uid);
            setStatus('Uploaded successfully!');
        } catch (e) {
            console.error(e);
            setStatus('Upload failed.');
        }
    };

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div>
                <input type="file" onChange={(e) => setFile(e.target.files[0])} />
                <button onClick={handleUpload}>Upload</button>
                <span style={{ marginLeft: 8 }}>{status}</span>
            </div>
            <Viewer studyUID={studyUID} />
        </div>
    );
}



