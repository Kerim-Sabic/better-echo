import { Button } from "@/general_components/ui/button";
import { Input } from "@/general_components/ui/input";
import { Label } from "@/general_components/ui/label";
import LoginErrorAlert from "./LoginErrorAlert";

export default function LoginForm({
  username,
  password,
  error,
  isSubmitting,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="username" className="sr-only">
            Username
          </Label>
          <Input
            id="username"
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => onUsernameChange(e.target.value)}
            required
            className="h-12 rounded-lg border-0 border-b-2 border-border bg-transparent px-4 py-3 text-base focus-visible:border-primary focus-visible:ring-0 smooth-transition"
          />
        </div>

        <div>
          <Label htmlFor="password" className="sr-only">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            required
            className="h-12 rounded-lg border-0 border-b-2 border-border bg-transparent px-4 py-3 text-base focus-visible:border-primary focus-visible:ring-0 smooth-transition"
          />
        </div>
      </div>

      <LoginErrorAlert error={error} />

      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="w-full text-base font-semibold tracking-wide"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
