import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Calendar,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  // Mock data (replace with API later)
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
    {
      id: "ECH-2024-003",
      patientName: "Emily Rodriguez",
      patientId: "MRN-234567",
      dateOfBirth: "1972-07-08",
      studyDate: "2024-01-14",
      studyTime: "11:20",
      status: "completed",
      ejectionFraction: 42,
      findings: "Mild LV dysfunction, recommend follow-up",
    },
    {
      id: "ECH-2024-004",
      patientName: "Robert Thompson",
      patientId: "MRN-345678",
      dateOfBirth: "1960-12-03",
      studyDate: "2024-01-14",
      studyTime: "09:15",
      status: "pending",
      findings: "Awaiting analysis",
    },
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "processing":
        return <Clock className="h-4 w-4 text-warning animate-pulse" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status, ef) => {
    if (status === "completed" && typeof ef === "number") {
      if (ef >= 55) return <Badge className="status-normal">Normal</Badge>;
      if (ef >= 40) return <Badge className="status-warning">Mild</Badge>;
      return <Badge className="status-critical">Severe</Badge>;
    }
    switch (status) {
      case "completed":
        return <Badge className="status-normal">Completed</Badge>;
      case "processing":
        return <Badge className="status-warning">Processing</Badge>;
      case "error":
        return <Badge className="status-critical">Error</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const filteredStudies = studies.filter((s) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      s.patientName.toLowerCase().includes(q) ||
      s.patientId.toLowerCase().includes(q);
    const matchesFilter =
      selectedFilter === "all" || s.status === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  const onNewStudy = () => navigate("/studies/new");
  const onSelectStudy = (study) =>
    navigate(`/studies/${encodeURIComponent(study.id)}`);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img
                src="/lovable-uploads/9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png"
                alt="Horalix Logo"
                className="h-8 w-8"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Patient Studies
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage and review echocardiogram analyses
                </p>
              </div>
            </div>

            <Button className="btn-clinical" onClick={onNewStudy}>
              <Plus className="mr-2 h-5 w-5" />
              New Study
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-6 py-6">
        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by patient name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-12"
            />
          </div>

          <div className="flex gap-2">
            {["all", "completed", "processing", "pending"].map((filter) => (
              <Button
                key={filter}
                variant={selectedFilter === filter ? "default" : "outline"}
                onClick={() => setSelectedFilter(filter)}
                className="capitalize"
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>

        {/* Studies Grid */}
        <div className="grid gap-4">
          {filteredStudies.map((study) => (
            <Card
              key={study.id}
              className="card-clinical cursor-pointer hover:scale-[1.01] transition-transform"
              onClick={() => onSelectStudy(study)}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                      <User className="h-6 w-6 text-primary" />
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">
                        {study.patientName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {study.patientId} • Born{" "}
                        {new Date(study.dateOfBirth).toLocaleDateString()}
                      </p>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(study.studyDate).toLocaleDateString()} at{" "}
                          {study.studyTime}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right space-y-2">
                    <div className="flex items-center justify-end space-x-2">
                      {getStatusIcon(study.status)}
                      {getStatusBadge(study.status, study.ejectionFraction)}
                    </div>

                    {typeof study.ejectionFraction === "number" && (
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Ejection Fraction
                        </p>
                        <p className="text-2xl font-bold text-primary">
                          {study.ejectionFraction}%
                        </p>
                      </div>
                    )}

                    <p className="text-sm text-muted-foreground max-w-xs">
                      {study.findings}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredStudies.length === 0 && (
          <div className="text-center py-12">
            <Activity className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No studies found
            </h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Create your first study to get started"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
