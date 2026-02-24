import React from "react";
import { Card, CardContent, CardTitle } from "../../../general_components/ui/card";
import Viewer from "../../../general_components/Viewer";

export default function EchocardiogramViewer({ studyUID }) {
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
                        <div className="flex items-center justify-center w-full h-[calc(100vh-303px)] rounded-md bg-muted text-muted-foreground">
                            No study UID
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
