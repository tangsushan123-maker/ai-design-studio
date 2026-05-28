import "server-only";

import { requireCurrentUser } from "@/lib/auth";
import { runWithConfigUser } from "@/lib/local-config";

export async function withCurrentConfigUser<T>(callback: () => T | Promise<T>): Promise<T> {
  const user = await requireCurrentUser();
  return await runWithConfigUser(user, callback);
}
