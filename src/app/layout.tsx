import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "AI Character Chat",
  description: "Innovative AI Chat Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen pb-24">
        {children}
        <Navigation />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
