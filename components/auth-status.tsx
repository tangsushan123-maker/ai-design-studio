import { LogOut, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export async function AuthStatus() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="auth-status" aria-label="当前账号">
      <div className="auth-status__identity">
        <ShieldCheck className="auth-status__icon" size={14} aria-hidden="true" />
        <span className="auth-status__text">
          <span className="auth-status__label">当前账号</span>
          <span className="auth-status__name">{user.name || user.email}</span>
          <span className="auth-status__email">{user.email}</span>
        </span>
      </div>
      <form action="/api/auth/logout" method="post">
        <button className="auth-status__button" type="submit" title="退出并切换账号" aria-label="退出并切换账号">
          <LogOut size={14} aria-hidden="true" />
          <span>切换账号</span>
        </button>
      </form>
    </div>
  );
}
