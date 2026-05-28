export async function readResponseErrorMessage(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) as { error?: string; message?: string } : {};
    return data.error || data.message || `${fallback}（HTTP ${response.status}）。`;
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
