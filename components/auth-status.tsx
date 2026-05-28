import { LogOut, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export async function AuthStatus() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="auth-status" aria-label="当前账号">
      <ShieldCheck size={14} aria-hidden="true" />
      <span className="auth-status__name">{user.name}</span>
      <form action="/api/auth/logout" method="post">
        <button className="auth-status__button" type="submit" title="退出登录" aria-label="退出登录">
          <LogOut size={14} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
