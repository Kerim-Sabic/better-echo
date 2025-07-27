import React, { useState } from 'react';
import axios from 'axios';

const UploadForm = ({ setOrthancId, setStatus }) => {
    const [file, setFile] = useState(null);

    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setStatus("Uploading...");
        try {
            const res = await axios.post('http://localhost:8000/upload-dicom', formData);
            const { orthanc_id } = res.data;
            setOrthancId(orthanc_id);
            console.log(orthanc_id);
            setStatus("Uploaded successfully!", orthanc_id);
        } catch (err) {
            setStatus("Upload failed.");
        }
    };

    return (
        <div>
            <input type="file" onChange={(e) => setFile(e.target.files[0])} />
            <button onClick={handleUpload}>Upload</button>
        </div>
    );
};

export default UploadForm;
