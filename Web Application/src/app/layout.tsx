import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { DesktopWindowControls } from "@/components/desktop/window-controls";
import { DesktopDragRegion } from "@/components/desktop/drag-region";
import { DesktopUpdateBanner } from "@/components/desktop/update-banner";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Video Generation AI — Property Video Generator",
  description:
    "Enterprise-grade SaaS platform for generating property marketing videos using AI. Convert raw property details into professional videos with Kannada TTS, subtitles, and social media content.",
  keywords: [
    "real estate",
    "property video",
    "AI video generator",
    "Kannada TTS",
    "property marketing",
    "Instagram reels",
    "real estate marketing",
  ],
  authors: [{ name: "Video Generation AI" }],
  openGraph: {
    type: "website",
    title: "Video Generation AI — Property Video Generator",
    description:
      "Convert raw property details into professional marketing videos with AI.",
    siteName: "Video Generation AI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={plusJakarta.variable} suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700;800&family=Lato:wght@400;700;900&family=Montserrat:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400;1,700;1,900&family=Outfit:wght@400;500;600;700;800&family=Oswald:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400;1,700&family=Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Raleway:wght@400;500;600;700;800&family=Roboto:ital,wght@0,400;0,500;0,700;0,900;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <DesktopDragRegion />
        <DesktopWindowControls />
        <DesktopUpdateBanner />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
