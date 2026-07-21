import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ScoutAI — Find Your Perfect Filming Location",
  description: "AI-powered film location scouting with Google Earth 3D and Zillow property views.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen antialiased">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
