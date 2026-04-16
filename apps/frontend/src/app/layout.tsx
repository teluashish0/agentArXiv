import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Plus_Jakarta_Sans, Rubik } from "next/font/google";
import { BookmarksProvider } from "./bookmarks-context";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["500", "600", "700", "800"],
});

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "agentArXiv",
  description: "Agent-native research and paper-writing frontend.",
  icons: {
    icon: [{ url: "/favicon-square.png", type: "image/png" }],
    shortcut: "/favicon-square.png",
    apple: "/favicon-square.png",
  },
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${rubik.variable}`}>
      <body>
        <ClerkProvider publishableKey={clerkPublishableKey}>
          <BookmarksProvider>{children}</BookmarksProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
