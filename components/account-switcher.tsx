"use client";

import { LogOut } from "lucide-react";

export function AccountSwitcher({ expanded = false }: { expanded?: boolean; compact?: boolean }) {

  async function switchAccount() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  }

  return (
    <button
      className={`account-switcher ${expanded ? "account-switcher--expanded" : ""}`}
      onClick={switchAccount}
      title="退出并切换账号"
      type="button"
    >
      <LogOut size={expanded ? 14 : 15} aria-hidden="true" />
      {expanded ? <span>切换账号</span> : null}
    </button>
  );
}
