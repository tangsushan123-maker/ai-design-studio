export async function readResponseErrorMessage(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) as { error?: string; message?: string } : {};
    return data.error || data.message || `${fallback}（HTTP ${response.status}）。`;
  } catch {
    return `${fallback}（HTTP ${response.status}）：${text.slice(0, 180) || "接口没有返回错误详情"}`;
  }
}
