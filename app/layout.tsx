import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/app/components/navbar";
import FloatingUploadButton from "@/app/components/FloatingUploadButton";
import { UploadModalProvider } from "@/app/context/UploadModalContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JokeWorks",
  description: "Make something funny.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <UploadModalProvider>
          <Navbar />
          <main className="flex-1 p-6">{children}</main>
          <FloatingUploadButton />
        </UploadModalProvider>
      </body>
    </html>
  );
}
