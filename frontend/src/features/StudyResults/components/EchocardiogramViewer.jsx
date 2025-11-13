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
            <div className="w-full h-[calc(100vh-303px)] rounded-xl overflow-hidden border bg-black">
              <Viewer studyUID={studyUID} />
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-[calc(100vh-265px)] rounded-md bg-muted text-muted-foreground">
              No study UID
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EchocardiogramViewerSection;
