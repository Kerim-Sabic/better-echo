// src/pages/HomePage.jsx
import React, { useState } from "react";
import {
  Plus,
  Search,
  Calendar,
  User,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/horalix_logo.png"; // or move file to /public and use "/horalix_logo.png"


const HomePage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  const navigate = useNavigate();

  // Mock patient/study data (replace later with backend API call)
  const studies = [
    {
      id: "ECH-2024-001",
      patientName: "Sarah Johnson",
      patientId: "MRN-789123",
      dateOfBirth: "1965-03-15",
      studyDate: "2024-01-15",
      studyTime: "14:30",
      status: "completed",
      ejectionFraction: 58,
      findings: "Normal LV function, no significant abnormalities",
    },
    {
      id: "ECH-2024-002",
      patientName: "Michael Chen",
      patientId: "MRN-456789",
      dateOfBirth: "1958-11-22",
      studyDate: "2024-01-15",
      studyTime: "15:45",
      status: "processing",
      findings: "AI analysis in progress",
    },
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return <CheckCircle size={16} color="#16a34a" />;
      case "processing":
        return <Clock size={16} color="#d97706" />;
      case "error":
        return <AlertCircle size={16} color="#dc2626" />;
      default:
        return <Clock size={16} color="#6b7280" />;
    }
  };

  const getStatusBadge = (status, ef) => {
    if (status === "completed" && typeof ef === "number") {
      if (ef >= 55) return <span style={{ color: "green" }}>Normal</span>;
      if (ef >= 40) return <span style={{ color: "orange" }}>Mild</span>;
      return <span style={{ color: "red" }}>Severe</span>;
    }

    return <span>{status}</span>;
  };

  const filteredStudies = studies.filter((study) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
        !term ||
        study.patientName.toLowerCase().includes(term) ||
        study.patientId.toLowerCase().includes(term);
    const matchesFilter =
        selectedFilter === "all" || study.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  return (
      <div style={{ padding: 20 }}>
        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between" }}>
          <h1>Patient Studies</h1>
          <button
              onClick={() => navigate("/Forms")}
              style={{
                background: "#2563eb",
                color: "white",
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
          >
            <Plus size={18} /> New Patient
          </button>
        </header>

        {/* Search + Filters */}
        <div style={{ margin: "20px 0" }}>
          <div style={{ marginBottom: 10 }}>
            <Search size={18} style={{ marginRight: 8 }} />
            <input
                placeholder="Search by patient name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            {["all", "completed", "processing", "pending"].map((f) => (
                <button
                    key={f}
                    style={{
                      marginRight: 6,
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "1px solid #ddd",
                      background: selectedFilter === f ? "#2563eb" : "#fff",
                      color: selectedFilter === f ? "#fff" : "#000",
                    }}
                    onClick={() => setSelectedFilter(f)}
                >
                  {f}
                </button>
            ))}
          </div>
        </div>

        {/* Patient List */}
        <div>
          {filteredStudies.map((study) => (
              <div
                  key={study.id}
                  style={{
                    border: "1px solid #ddd",
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => navigate(`/patients/${study.id}`)}
              >
                <h3>{study.patientName}</h3>
                <p>{study.patientId}</p>
                <div>
                  {getStatusIcon(study.status)}{" "}
                  {getStatusBadge(study.status, study.ejectionFraction)}
                </div>
                {study.ejectionFraction && (
                    <p>Ejection Fraction: {study.ejectionFraction}%</p>
                )}
                <p>{study.findings}</p>
              </div>
          ))}

          {filteredStudies.length === 0 && (
              <div style={{ textAlign: "center", marginTop: 40 }}>
                <Activity size={32} color="gray" />
                <p>No studies found</p>
              </div>
          )}
        </div>
      </div>
  );
};

export default HomePage;
