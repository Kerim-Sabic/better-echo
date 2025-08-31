import React from "react";
import { Card, CardContent, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import Viewer from "../../components/Viewer";

const EchocardiogramViewerSection = ({ studyUID, instanceId, showSeg, setShowSeg }) => {
  return (
    <Card className="overflow-hidden card-clinical">
      <div className="flex items-center justify-between px-6 pt-4">
        <CardTitle className="text-lg">Echocardiogram Video</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSeg((s) => !s)}
          className="inline-flex items-center gap-2"
        >
          {showSeg ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showSeg ? "Hide Segmentation" : "Show Segmentation"}
        </Button>
      </div>
      <CardContent className="p-0">
        <div className="p-6">
          {studyUID || instanceId ? (
            <Viewer studyUID={studyUID} instanceId={instanceId} showSeg={showSeg} />
          ) : (
            <div className="flex items-center justify-center w-full rounded-md aspect-video bg-muted text-muted-foreground">
              No study UID / instance ID
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};   

export default EchocardiogramViewerSection;
