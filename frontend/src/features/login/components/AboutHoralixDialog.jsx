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
          <DialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>
                Horalix Echo is a hospital-grade AI echocardiography platform that provides
                real-time analysis for cardiologists and sonographers.
              </p>
              <p>
                <strong>Key Features:</strong>
              </p>
              <ul className="space-y-1 text-sm list-disc list-inside">
                <li>Multi-model AI analysis with primary and secondary cardiac classification</li>
                <li>Automated 2D linear measurements (IVS, LVID, LVPW, aorta, LA, RV, and more)</li>
                <li>Doppler spectral measurements (LVOT, MV, AV, TV, and tricuspid velocities)</li>
                <li>LV wall motion segmentation with annotated video output</li>
                <li>AI-generated clinical reports with structured diagnoses</li>
                <li>DICOM upload and OHIF viewer integration</li>
              </ul>
              <p className="pt-2 text-xs text-muted-foreground">Powered by Horalix</p>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
