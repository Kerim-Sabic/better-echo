import React from "react";

export default function NewStudyHeader({ status }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="container flex items-center justify-between px-6 py-4 mx-auto">
        {/* Left Section: Logo + Title */}
        <div className="flex items-center space-x-4">
          <img
            src="horalix-taskbar-app-icon.png"
            alt="Horalix Logo"
            className="w-8 h-8"
            onLoad={() => console.log("NewStudyHeader logo loaded")}
            onError={(e) => { console.warn("NewStudyHeader logo failed", e); }}
          />
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Study</h1>
            <p className="text-sm text-muted-foreground">
              Upload a DICOM to create a study. You can add/override patient info if needed.
            </p>
          </div>
        </div>

        {/* Right Section: Status */}
        <div className="text-sm text-muted-foreground">{status}</div>
      </div>
    </header>
  );
}
