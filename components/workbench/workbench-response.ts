export function responseErrorMessage(response: Response, data: { error?: string; message?: string }, fallback: string) {
  const detail = data.error || data.message;
  if (response.status === 401) return detail || "登录已过期，请重新登录。";
  if (response.status === 403) return detail || "当前账号没有权限执行这个操作。";
  return detail || `${fallback}（HTTP ${response.status}）。`;
}

export async function readResponseErrorMessage(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) as { error?: string; message?: string } : {};
    return responseErrorMessage(response, data, fallback);
  } catch {
    return `${fallback}（HTTP ${response.status}）：${text.slice(0, 180) || "接口没有返回错误详情"}`;
  }
}

export function withClientTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}
