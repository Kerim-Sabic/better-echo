import { ArrowLeft } from "lucide-react";
import { Button } from "@/general_components/ui/button";
import BrandLogo from "@/general_components/BrandLogo";

export default function NewStudyHeader({ newStudyPageViewModel }) {
  const { status, onBack } = newStudyPageViewModel;

  return (
    <header className="border-b border-border bg-card">
      <div className="container flex items-center justify-between px-6 py-4 mx-auto">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={onBack}
            className="gap-2 hover:scale-105 hover:bg-primary/10 hover:text-primary fast-transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </Button>

          <BrandLogo className="w-8 h-8" />

          <div>
            <h1 className="text-2xl font-bold heading-accent">New Study</h1>
            <p className="text-sm text-muted-foreground">Upload and analyze echocardiogram</p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">{status}</div>
      </div>
    </header>
  );
}
