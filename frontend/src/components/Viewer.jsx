// src/components/Viewer.jsx
import React from 'react';

export default function Viewer({ studyUID }) {
    if (!studyUID) return null;
    const src = `http://localhost:8042/stone-webviewer/index.html?study=${encodeURIComponent(studyUID)}`;
    return (
        <div style={{ height: '80vh', border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
            <iframe
                title="Stone Web Viewer"
                src={src}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="cross-origin-isolated"
            />
        </div>
    );
}



