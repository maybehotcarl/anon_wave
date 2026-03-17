import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://anonwave.live"),
  title: "anonwave.live — say what you actually think",
  description: "Anonymous honest feedback, rumors, and gossip posted straight into the 6529 Anon Wave. No wallet. No login. No trail.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
