import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import "./landing.css";

export const metadata: Metadata = {
  title: "Video Studio — AI Marketing Videos for Real Estate",
  description:
    "Turn raw property details into professional Kannada marketing videos, voiceovers, Instagram reels, and social copies — 100% offline on your Windows PC.",
  openGraph: {
    type: "website",
    title: "Video Studio — AI Marketing Videos for Real Estate",
    description:
      "Scripts, voiceovers, reels, and social posts for Karnataka real estate — offline desktop app.",
  },
  twitter: { card: "summary_large_image" },
};

export default function Home() {
  return <LandingPage />;
}
