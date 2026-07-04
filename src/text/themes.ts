export interface TextTheme {
	id: string;
	name: string;
	fontFamily: string;
	fontWeight: string;
	color: string;
	fontSize: number;
	letterSpacing?: number;
	lineHeight?: number;
	"stroke.enabled": boolean;
	"stroke.color"?: string;
	"stroke.width"?: number;
	"shadow.enabled": boolean;
	"shadow.color"?: string;
	"shadow.blur"?: number;
	"shadow.offsetX"?: number;
	"shadow.offsetY"?: number;
	"background.enabled": boolean;
	"background.color"?: string;
	"background.cornerRadius"?: number;
	"background.paddingX"?: number;
	"background.paddingY"?: number;
	"gradient.enabled"?: boolean;
	"gradient.colors"?: string[];
	"gradient.direction"?: "horizontal" | "vertical";
	animationPreset?: string;
	textTransform?: "uppercase" | "lowercase" | "capitalize" | "none";
}

export const PREDEFINED_TEXT_THEMES: TextTheme[] = [
	{
		id: "luxury-real-estate",
		name: "Luxury Real Estate",
		fontFamily: "Montserrat",
		fontWeight: "800",
		color: "#ffffff",
		fontSize: 48,
		letterSpacing: 2,
		"stroke.enabled": false,
		"shadow.enabled": true,
		"shadow.color": "rgba(0,0,0,0.5)",
		"shadow.blur": 8,
		"shadow.offsetX": 2,
		"shadow.offsetY": 2,
		"background.enabled": false,
		animationPreset: "zoomIn",
	},
	{
		id: "documentary",
		name: "Documentary",
		fontFamily: "Bebas Neue",
		fontWeight: "400",
		color: "#ffffff",
		fontSize: 54,
		letterSpacing: 1.5,
		"stroke.enabled": true,
		"stroke.color": "#000000",
		"stroke.width": 2,
		"shadow.enabled": true,
		"shadow.color": "#000000",
		"shadow.blur": 4,
		"shadow.offsetX": 2,
		"shadow.offsetY": 2,
		"background.enabled": false,
		animationPreset: "fadeIn",
		textTransform: "uppercase",
	},
	{
		id: "modern-minimal",
		name: "Modern Minimal",
		fontFamily: "Inter",
		fontWeight: "600",
		color: "#ffffff",
		fontSize: 42,
		letterSpacing: 0,
		"stroke.enabled": false,
		"shadow.enabled": false,
		"background.enabled": false,
		animationPreset: "fadeScale",
	},
	{
		id: "fact-channel",
		name: "Fact Channel",
		fontFamily: "Anton",
		fontWeight: "400",
		color: "#ffffff",
		fontSize: 60,
		letterSpacing: 1,
		"stroke.enabled": true,
		"stroke.color": "#000000",
		"stroke.width": 5,
		"shadow.enabled": true,
		"shadow.color": "#000000",
		"shadow.blur": 0,
		"shadow.offsetX": 3,
		"shadow.offsetY": 3,
		"background.enabled": false,
		animationPreset: "popIn",
		textTransform: "uppercase",
	},
	{
		id: "news",
		name: "News Headline",
		fontFamily: "Oswald",
		fontWeight: "700",
		color: "#ffffff",
		fontSize: 48,
		"stroke.enabled": false,
		"shadow.enabled": false,
		"background.enabled": true,
		"background.color": "#d32f2f",
		"background.cornerRadius": 0,
		"background.paddingX": 20,
		"background.paddingY": 10,
		animationPreset: "slideInLeft",
		textTransform: "uppercase",
	},
	{
		id: "cinematic",
		name: "Cinematic",
		fontFamily: "Playfair Display",
		fontWeight: "400",
		color: "#ffffff",
		fontSize: 56,
		letterSpacing: 6,
		"stroke.enabled": false,
		"shadow.enabled": true,
		"shadow.color": "rgba(0,0,0,0.8)",
		"shadow.blur": 15,
		"background.enabled": false,
		animationPreset: "fadeScale",
	},
	{
		id: "luxury-promo",
		name: "Luxury Promo",
		fontFamily: "Lora",
		fontWeight: "400",
		color: "#d4af37", // Gold
		fontSize: 48,
		letterSpacing: 2,
		"stroke.enabled": false,
		"shadow.enabled": true,
		"shadow.color": "rgba(0,0,0,0.6)",
		"shadow.blur": 10,
		"background.enabled": false,
		"gradient.enabled": true,
		"gradient.colors": ["#d4af37", "#f3e5ab"], // Gold to light gold
		animationPreset: "slowFadeIn",
	},
	{
		id: "social-viral",
		name: "Social Media Viral",
		fontFamily: "Outfit",
		fontWeight: "900",
		color: "#ffeb3b", // Yellow
		fontSize: 64,
		"stroke.enabled": true,
		"stroke.color": "#000000",
		"stroke.width": 4,
		"shadow.enabled": true,
		"shadow.color": "#000000",
		"shadow.blur": 5,
		"shadow.offsetX": 5,
		"shadow.offsetY": 5,
		"background.enabled": false,
		animationPreset: "bounce",
		textTransform: "uppercase",
	},
	{
		id: "tech",
		name: "Tech Minimal",
		fontFamily: "Space Grotesk",
		fontWeight: "500",
		color: "#00ffff", // Cyan
		fontSize: 46,
		letterSpacing: 3,
		"stroke.enabled": false,
		"shadow.enabled": true,
		"shadow.color": "#00ffff",
		"shadow.blur": 20,
		"background.enabled": false,
		animationPreset: "typewriter",
	},
	{
		id: "podcast",
		name: "Podcast Clip",
		fontFamily: "Poppins",
		fontWeight: "800",
		color: "#ffffff",
		fontSize: 52,
		"stroke.enabled": false,
		"shadow.enabled": true,
		"shadow.color": "rgba(0,0,0,0.8)",
		"shadow.blur": 10,
		"background.enabled": true,
		"background.color": "rgba(0,0,0,0.5)",
		"background.cornerRadius": 8,
		"background.paddingX": 15,
		"background.paddingY": 5,
		animationPreset: "highlightWord",
	}
];
