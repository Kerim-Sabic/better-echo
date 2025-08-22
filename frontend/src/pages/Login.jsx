import { useState } from "react";
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

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onLogin = () => navigate("/dashboard"); // adjust to your route plan

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-clinical flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/lovable-uploads/9d9bcdf0-8a16-4777-8dc3-85ea7af6f600.png"
              alt="Horalix Logo"
              className="h-12 w-12 mr-3"
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
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="cardiologist@hospital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 btn-clinical text-lg font-medium"
                disabled={isLoading}
              >
                {isLoading ? "Signing In..." : "Sign In"}
              </Button>

              <div className="text-center">
                <a href="#" className="text-sm text-primary hover:underline">
                  Forgot your password?
                </a>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-border">
              <Button variant="outline" className="w-full h-12 mb-3">
                <Shield className="mr-2 h-5 w-5" />
                Sign in with Hospital SSO
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Dialog>
            <DialogTrigger asChild>
              <button className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center">
                <Info className="mr-1 h-4 w-4" />
                About Horalix Echo
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>About Horalix Echo</DialogTitle>
                <DialogDescription className="text-left space-y-3">
                  <p>
                    Horalix Echo is a hospital-grade AI echocardiography
                    platform that provides real-time analysis for cardiologists
                    and sonographers.
                  </p>
                  <p>
                    <strong>Key Features:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Real-time AI segmentation and measurements</li>
                    <li>Automated ejection fraction calculation</li>
                    <li>Valve assessment and severity grading</li>
                    <li>Clinical-grade reporting</li>
                    <li>DICOM integration</li>
                  </ul>
                  <p className="text-xs text-muted-foreground pt-2">
                    Powered by PanEcho & EchoPrime AI
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
