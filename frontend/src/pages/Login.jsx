import { useContext, useState } from "react";
import { Fingerprint, Info } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
import {
    completeWebauthnAuthApi,
    getWebauthnAuthOptionsApi,
} from "../api/AuthenticationApi";
import { b64uToBuf, serializePublicKeyCredential } from "../lib/webauthn";

export default function Login() {
    const navigate = useNavigate();
    const { login, setUser } = useContext(AuthContext);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [bioLoading, setBioLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            await login(username, password);
            navigate("/dashboard");
        } catch (err) {
            console.error("Login error:", err);
            const detail = err?.response?.data?.detail;
            setError(detail || "Login failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleBiometricLogin = async () => {
        setError("");
        if (!window.PublicKeyCredential) {
            setError("Biometric login is not supported in this browser.");
            return;
        }

        setBioLoading(true);
        try {
            const options = await getWebauthnAuthOptionsApi("");
            const pk = options.publicKey;
            const publicKey = {
                ...pk,
                challenge: b64uToBuf(pk.challenge),
                allowCredentials: (pk.allowCredentials || []).map((cred) => ({
                    ...cred,
                    id: b64uToBuf(cred.id),
                })),
            };

            const assertion = await navigator.credentials.get({ publicKey });
            const serialized = serializePublicKeyCredential(assertion);
            const authResponse = await completeWebauthnAuthApi({
                username: "",
                credential: serialized,
            });
            setUser(authResponse.user);
            navigate("/dashboard");
        } catch (err) {
            console.error("Biometric login error:", err);
            if (err?.response?.status === 404) {
                setError("Biometrics are not set up yet. Sign in with your username/password, then enroll biometrics from the Dashboard.");
                return;
            }
            const detail = err?.response?.data?.detail;
            setError(detail || "Biometric login failed. Please try again.");
        } finally {
            setBioLoading(false);
        }
    };

    return (
        <div
            className="theme-login relative flex items-center justify-center px-4 bg-[#f8f8f8]"
            style={{ minHeight: `calc(100vh - ${TITLEBAR_HEIGHT}px)` }}
        >
            {/* Subtle radial background pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(147,51,234,0.05),transparent_55%)] pointer-events-none" />

            <div className="relative w-full max-w-md px-2 animate-fade-in">
                {/* Logo + title */}
                <div className="text-center mb-10 animate-slide-up">
                    <img src="horalix-taskbar-app-icon.png" alt="Horalix Logo" className="h-20 w-auto mx-auto drop-shadow-lg mb-3" />
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">Horalix Pulse</h1>
                    <p className="text-muted-foreground font-light text-sm tracking-wide">AI-Powered Cardiac Precision</p>
                </div>

                {/* Glassmorphic login card */}
                <div className="glass-card rounded-2xl p-8 animate-slide-up" style={{ animationDelay: "0.05s" }}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="username" className="sr-only">Username</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder="Username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    className="h-12 rounded-lg border-0 border-b-2 border-border bg-transparent px-4 py-3 text-base focus-visible:border-primary focus-visible:ring-0 smooth-transition"
                                />
                            </div>

                            <div>
                                <Label htmlFor="password" className="sr-only">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="h-12 rounded-lg border-0 border-b-2 border-border bg-transparent px-4 py-3 text-base focus-visible:border-primary focus-visible:ring-0 smooth-transition"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 border border-red-200 rounded-md bg-red-50">
                                <p className="text-sm text-red-600">{error}</p>
                            </div>
                        )}

                        <Button type="submit" variant="gradient" size="lg" className="w-full text-base font-semibold tracking-wide" disabled={isLoading}>
                            {isLoading ? "Signing in..." : "Sign In"}
                        </Button>
                    </form>

                    {/* Biometric only, centered */}
                    <div className="mt-6 pt-6 border-t border-border/50 flex items-center justify-center">
                        <button
                            type="button"
                            onClick={handleBiometricLogin}
                            disabled={bioLoading}
                            className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-primary smooth-transition disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label="Biometric login"
                        >
                            <Fingerprint className="w-5 h-5 group-hover-animate-glow group-hover:drop-shadow-[0_0_12px_rgba(147,51,234,0.55)]" />
                            <span className="text-xs">
                                {bioLoading ? "Connecting..." : "Biometric"}
                            </span>
                        </button>
                    </div>
                </div>

                {/* About */}
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
