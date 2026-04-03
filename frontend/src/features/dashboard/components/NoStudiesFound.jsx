import React from "react";

export default function NoStudiesFound({ studySearchInputQuery }) {
  return (
    <div className="py-12 text-center">
      <h3 className="mb-2 text-lg font-medium text-foreground">No studies found</h3>
      <p className="text-muted-foreground">
        {studySearchInputQuery
          ? "Try adjusting your search terms"
          : "Create your first study to get started"}
      </p>
    </div>
  );
}
