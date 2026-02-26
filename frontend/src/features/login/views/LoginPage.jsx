import LoginLayout from "@/features/login/views/LoginLayout";
import { useLoginPageViewModel } from "@/features/login/viewmodels/useLoginPageViewModel";

export default function LoginPage() {
  const loginPageVM = useLoginPageViewModel();

  return <LoginLayout loginPageVM={loginPageVM} />;
}
