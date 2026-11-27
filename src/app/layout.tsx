import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { PwaRegistration } from "@/components/layout/pwa-registration";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IMS Network · ESITH Alumni",
  description: "The professional network for ESITH IMS alumni.",
  manifest: "/ims.webmanifest",
  appleWebApp: {capable:true,title:"IMS Network",statusBarStyle:"default"},
  icons: {apple:"/ims-icon-192.png",icon:"/ims-icon-192.png"},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>{children}
        <PwaRegistration/><Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
