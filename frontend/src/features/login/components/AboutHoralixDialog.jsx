import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/general_components/ui/dialog";

export default function AboutHoralixDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center text-sm transition-colors text-muted-foreground hover:text-primary">
          <Info className="w-4 h-4 mr-1" />
          About Horalix Echo
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About Horalix Echo</DialogTitle>
          <DialogDescription className="space-y-3 text-left">
            <p>
              Horalix Echo is a hospital-grade AI echocardiography platform that provides
              real-time analysis for cardiologists and sonographers.
            </p>
            <p>
              <strong>Key Features:</strong>
            </p>
            <ul className="space-y-1 text-sm list-disc list-inside">
              <li>Real-time AI segmentation and measurements</li>
              <li>Automated ejection fraction calculation</li>
              <li>Valve assessment and severity grading</li>
              <li>Clinical-grade reporting</li>
              <li>DICOM integration</li>
            </ul>
            <p className="pt-2 text-xs text-muted-foreground">Powered by Horalix</p>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
