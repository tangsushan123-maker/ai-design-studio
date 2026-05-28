"use client";

import Link from "next/link";
import { Repeat2, UserCog, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AccountMenuUser = { email?: string; name?: string; role?: "owner" | "user" };

let cachedUser: AccountMenuUser | null = null;
let userLoaded = false;
let userRequest: Promise<AccountMenuUser | null> | null = null;

async function loadCurrentUser() {
  if (userLoaded) return cachedUser;
  userRequest ??= fetch("/api/auth/me")
    .then((response) => response.json())
    .then((data) => data.user || null)
    .catch(() => null)
    .finally(() => {
      userRequest = null;
    });
  cachedUser = await userRequest;
  userLoaded = true;
  return cachedUser;
}

export function AccountSwitcher({ expanded = false }: { expanded?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AccountMenuUser | null>(cachedUser);

  useEffect(() => {
    let alive = true;
    void loadCurrentUser().then((nextUser) => {
      if (alive) setUser(nextUser);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeMenu(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("[data-account-menu]")) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const isAdmin = user?.role === "owner";
  const displayName = useMemo(() => user?.name || user?.email || "账号", [user?.email, user?.name]);

  async function switchAccount() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  }

  return (
    <div className="account-menu" data-account-menu>
      <button
        aria-expanded={open}
        className={`account-switcher ${expanded ? "account-switcher--expanded" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title="账号"
        type="button"
      >
        <UserCog size={expanded ? 14 : 15} aria-hidden="true" />
        {expanded ? <span>账号</span> : null}
      </button>
      {open ? (
        <div className={`account-menu__panel ${expanded ? "account-menu__panel--expanded" : ""}`} role="menu">
          <div className="account-menu__identity">
            <span className="account-menu__name">{displayName}</span>
            <span className="account-menu__role">{isAdmin ? "管理员" : "普通账号"}</span>
          </div>
          {isAdmin ? (
            <Link className="account-menu__item" href="/accounts" role="menuitem" onClick={() => setOpen(false)}>
              <Users size={14} aria-hidden="true" />
              <span>子账号管理</span>
            </Link>
          ) : null}
          <button className="account-menu__item" onClick={switchAccount} role="menuitem" type="button">
            <Repeat2 size={14} aria-hidden="true" />
            <span>切换账号</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
