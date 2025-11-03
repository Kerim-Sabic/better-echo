// src/features/StudyResults/components/EchocardiogramViewerSection.jsx
import React from "react";
import { Card, CardContent, CardTitle } from "../../../components/ui/card";
import Viewer from "../../../components/Viewer";

const EchocardiogramViewerSection = ({ studyUID }) => {
  return (
    <Card className="overflow-hidden card-clinical">
      <div className="flex items-center justify-between px-6 pt-4">
        <CardTitle className="text-lg">Echocardiogram Video</CardTitle>
      </div>
      <CardContent className="p-0">
        <div className="p-6">
          {studyUID ? (
            <Viewer studyUID={studyUID} />
          ) : (
            <div className="flex items-center justify-center w-full rounded-md aspect-video bg-muted text-muted-foreground">
              No study UID
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EchocardiogramViewerSection;
