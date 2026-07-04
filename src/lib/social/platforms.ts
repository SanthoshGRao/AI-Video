export type SocialPlatformId =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "youtube"
  | "telegram";

export const SOCIAL_PLATFORMS: {
  id: SocialPlatformId;
  label: string;
  dbPlatform: "INSTAGRAM" | "FACEBOOK" | "WHATSAPP" | "YOUTUBE" | "TELEGRAM";
  captionKey:
    | "instagramCaptions"
    | "facebookCopies"
    | "whatsappCopies"
    | "youtubeDescriptions"
    | "telegramCopy";
  color: string;
}[] = [
  { id: "instagram", label: "Instagram", dbPlatform: "INSTAGRAM", captionKey: "instagramCaptions", color: "#E4405F" },
  { id: "facebook", label: "Facebook", dbPlatform: "FACEBOOK", captionKey: "facebookCopies", color: "#1877F2" },
  { id: "whatsapp", label: "WhatsApp", dbPlatform: "WHATSAPP", captionKey: "whatsappCopies", color: "#25D366" },
  { id: "youtube", label: "YouTube", dbPlatform: "YOUTUBE", captionKey: "youtubeDescriptions", color: "#FF0000" },
  { id: "telegram", label: "Telegram", dbPlatform: "TELEGRAM", captionKey: "telegramCopy", color: "#26A5E4" },
];

export function platformById(id: SocialPlatformId) {
  return SOCIAL_PLATFORMS.find((p) => p.id === id);
}

export function buildShareUrl(platform: SocialPlatformId, text: string, videoUrl?: string | null): string | null {
  const payload = videoUrl ? `${text.trim()}\n\n${videoUrl}` : text.trim();
  switch (platform) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(payload)}`;
    case "telegram":
      return videoUrl
        ? `https://t.me/share/url?url=${encodeURIComponent(videoUrl)}&text=${encodeURIComponent(text.trim())}`
        : `https://t.me/share/url?text=${encodeURIComponent(text.trim())}`;
    case "youtube":
      return "https://studio.youtube.com/channel/upload";
    case "instagram":
      return "https://www.instagram.com/";
    case "facebook":
      return "https://www.facebook.com/";
    default:
      return null;
  }
}
