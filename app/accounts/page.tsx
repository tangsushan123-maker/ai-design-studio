import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminAccountsManager } from "@/components/admin-accounts-manager";

export default function AccountsPage() {
  return (
    <main className="apple-shell min-h-screen px-4 py-5 text-[#f5f7fb]">
      <section className="mx-auto max-w-[1180px]">
        <header className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="apple-title">子账号管理</h1>
            <p className="apple-subtitle mt-1">账号、权限、项目统计和子账号 API Key 状态。</p>
          </div>
          <div className="flex gap-2">
            <Link className="apple-button inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white/78" href="/">
              <ArrowLeft className="size-4" />
              工作台
            </Link>
            <Link className="apple-button inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white/78" href="/settings">
              API 设置
            </Link>
          </div>
        </header>
        <AdminAccountsManager />
      </section>
    </main>
  );
}
