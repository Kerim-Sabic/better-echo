import { Plus } from "lucide-react";
import { Button } from "../../components/ui/button";

export default function DashboardHeader({ onNewStudy }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="container px-6 py-4 mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img
              src="/lovable-uploads/9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png"
              alt="Horalix Logo"
              className="w-8 h-8"
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
            <Plus className="w-5 h-5 mr-2" />
            New Study
          </Button>
        </div>
      </div>
    </header>
  );
}
