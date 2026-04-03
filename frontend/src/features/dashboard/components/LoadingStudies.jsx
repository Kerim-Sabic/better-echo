import React from "react";
import { Activity } from "lucide-react";

export default function LoadingStudies() {
  return (
    <div className="py-12 text-center">
      <Activity className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
      <p className="text-muted-foreground">Loading studies...</p>
    </div>
  );
}
