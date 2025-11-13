import { useContext, useState, useTransition } from "react";
import { Eye, EyeOff, Shield, Info } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../contexts/AuthenticationContext";
import { TITLEBAR_HEIGHT } from "../components/TitleBar";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext)

 const [username, setUsername] = useState("");
 const [password, setPassword] = useState("")
 const [showPassword, setShowPassword] = useState(false);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await login(username, password)
      navigate("/dashboard")
    } catch (err) {
      console.error("Login error:", err);
      setError(err.reponse?.detail || "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-4 bg-gradient-clinical" style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)`}}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <img
              src="horalix-taskbar-app-icon.png"
              alt="Horalix Logo"
              className="w-12 h-12 mr-3"
            />
            <div>
              <h1 className="text-3xl font-bold text-primary">Horalix Echo</h1>
              <p className="text-sm text-muted-foreground">
                AI-Powered Cardiac Insights
              </p>
            </div>
          </div>
        </div>

        <Card className="card-clinical">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold">
              Welcome Back
            </CardTitle>
            <CardDescription>
              Sign in to access your cardiac analysis platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute transition-colors -translate-y-1/2 right-3 top-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 border border-red-200 rounded-md bg-red-50">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                variant="clinical"
                className="w-full h-12 text-lg font-medium"
                disabled={isLoading}
              >
                {isLoading ? "Signing In..." : "Sign In"}
              </Button>

            </form>

            <div className="pt-6 mt-6 border-t border-border">
              <Button variant="outline" className="w-full h-12 mb-3">
                <Shield className="w-5 h-5 mr-2" />
                Sign in with Hospital SSO
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
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
                    Horalix Echo is a hospital-grade AI echocardiography
                    platform that provides real-time analysis for cardiologists
                    and sonographers.
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
                  <p className="pt-2 text-xs text-muted-foreground">
                    Powered by Horalix
                  </p>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
