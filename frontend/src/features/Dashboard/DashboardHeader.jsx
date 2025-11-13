import React, { useContext} from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LogOut } from "lucide-react";
import { Button } from "../../components/ui/button";
import { AuthContext } from "../../contexts/AuthenticationContext";

export default function DashboardHeader({ onNewStudy }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", {replace: true});
    } catch (err) {
      console.error("Logout failed: ", err)
    }
  };


  return (
    <header className="border-b border-border bg-card">
      <div className="container px-6 py-4 mx-auto">
        <div className="flex items-center justify-between">
          {/* LEFT SIDE */}
          <div className="flex items-center space-x-4">
            <img
              src="horalix-taskbar-app-icon.png"
              alt="Horalix Logo"
              className="w-8 h-8"
            />
            <div>
              <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#9333EA] via-[#6366F1] to-[#06B6D4]">
                Patient Studies
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage and review echocardiogram analyses
              </p>
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className="flex items-center space-x-4">
            {/* Show user info */}
            {user && (
              <div className="text-right">
                <div className="font-medium">{user.username}</div>
                <div className="text-xs text-muted-foreground">
                  {user.role ?? "Doctor"}
                </div>
              </div>
            )}

            {/* New Study button */}
            <Button variant="clinical" onClick={onNewStudy}>
              <Plus className="w-5 h-5 mr-2" />
              New Study
            </Button>

            {/* Logout button */}
            {user && (
              <Button
                variant="outline"
                onClick={handleLogout}
                className="flex items-center"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </Button>
            )}
          </div>
        </div>
        {/* Removed accent underline per request */}
      </div>
    </header>
  );
}
