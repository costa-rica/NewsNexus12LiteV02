import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { FlowProvider } from "@/state/FlowContext";

import "./globals.css";

export const metadata: Metadata = {
  title: "News Nexus Lite",
  description: "Foundation portal shell for the News Nexus Lite demo.",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body>
        <ThemeProvider>
          <FlowProvider>{children}</FlowProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
