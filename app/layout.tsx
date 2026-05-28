import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Design Studio MVP",
  description: "Upload, generate, edit, and export design images with OpenAI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
