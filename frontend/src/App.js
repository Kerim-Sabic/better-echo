import React, { useState } from 'react';
import UploadForm from './components/UploadForm';
import Viewer from './components/Viewer';
import ResultPanel from './components/ResultPanel';

function App() {
    const [orthancId, setOrthancId] = useState(null);
    const [status, setStatus] = useState("");
    // const [ef, setEf] = useState(null);  // (optional)
    // const [maskUrl, setMaskUrl] = useState(null);  // (optional)

    return (
        <div>
            <h1>Horalix Echo Viewer</h1>
            <p>{status}</p>
            {!orthancId ? (
                <UploadForm setOrthancId={setOrthancId} setStatus={setStatus} />
            ) : (
                <>
                    <Viewer orthancId={orthancId} />
                    {/*<ResultPanel ef={ef} segmentationUrl={maskUrl} />*/}
                </>
            )}
        </div>
    );
}

export default App;
