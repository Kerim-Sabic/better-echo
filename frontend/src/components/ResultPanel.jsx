import Viewer from "./Viewer";

const ResultPanel = ({ ef, segmentationUrl }) => (
    <div>
        <h3>AI Result</h3>
        {ef && <p>Ejection Fraction: {ef}%</p>}
        {segmentationUrl && <img src={segmentationUrl} alt="Segmentation" />}
    </div>
);

export default ResultPanel;
