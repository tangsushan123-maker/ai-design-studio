"use client";

import Link from "next/link";
import { Repeat2, UserCog, Users } from "lucide-react";
import { useEffect, useState } from "react";

type AccountMenuUser = { email?: string; name?: string; role?: "owner" | "user" };
type AccountSwitcherProps = {
  compact?: boolean;
  expanded?: boolean;
};

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

export function AccountSwitcher({ compact = false, expanded = false }: AccountSwitcherProps) {
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

  async function switchAccount() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  }

  const menuClassName = `account-menu ${compact ? "account-menu--compact" : ""}`;
  const buttonClassName = [
    "account-switcher",
    compact ? "account-switcher--compact" : "",
    expanded ? "account-switcher--expanded" : "",
    open ? "account-switcher--open" : "",
  ].filter(Boolean).join(" ");
  const panelClassName = `account-menu__panel ${expanded ? "account-menu__panel--expanded" : ""}`;

  return (
    <div className={menuClassName} data-account-menu>
      <button
        aria-label="打开账号菜单"
        aria-expanded={open}
        className={buttonClassName}
        onClick={() => setOpen((value) => !value)}
        title="账号菜单"
        type="button"
      >
        <UserCog size={expanded ? 14 : 15} aria-hidden="true" />
        {expanded ? <span>账号</span> : null}
      </button>
      {open ? (
        <div className={panelClassName} role="menu">
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
