const Viewer = ({ orthancId }) => {
    return (
        <div style={{ height: "600px" }}>
            <iframe
                title="OHIF Viewer"
                src={`http://localhost:3001/viewer?studyUID=${orthancId}`}
                width="100%"
                height="100%"
                style={{ border: "none" }}
            />
        </div>
    );
};

export default Viewer;
