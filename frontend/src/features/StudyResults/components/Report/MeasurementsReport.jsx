import React from "react";

export default function MeasurementsReport({ patientName, studyUID, mainMeasurements = [], Measurements = [], showHeader = true }) {
  const dateStr = new Date().toLocaleString();

  const renderValue = (item) => {
    if (item == null) return "-";
    // buildAiMeasurementsProps returns strings for regression and object for classification
    if (typeof item.value === "object" && item.value) {
      const label = item.value.integrated_label || "-";
      return String(label);
    }
    if (typeof item.value === "string") return item.value;
    if (typeof item.value === "number") return String(item.value);
    return "-";
  };

  return (
    <div className="report-root">
      {showHeader && (
        <div className="report-header">
          <div className="brand">
            <div className="title">AI Measurements Report</div>
            <div className="meta">Generated: {dateStr}</div>
          </div>
          <div className="identity">
            <div>Patient: {patientName || "-"}</div>
            <div>UID: {studyUID || "-"}</div>
            <div className="meta">Generated: {dateStr}</div>
          </div>
        </div>
      )}

      {Array.isArray(mainMeasurements) && mainMeasurements.length > 0 && (
        <section className="section">
          <h2>Main Measurements</h2>
          <table className="table">
            <colgroup>
              <col style={{ width: "65%" }} />
              <col style={{ width: "35%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {mainMeasurements.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td>{renderValue(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {Array.isArray(Measurements) && Measurements.some((g) => (g.items || []).length > 0) && (
        <section className="section">
          <h2>Detailed Measurements</h2>
          {Measurements.map((group) => (
            <div className="group" key={group.section}>
              <h3 className="group-title">{group.section}</h3>
              <table className="table">
                <colgroup>
                  <col style={{ width: "65%" }} />
                  <col style={{ width: "35%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Measurement</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.items || []).map((m) => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td>{renderValue(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
