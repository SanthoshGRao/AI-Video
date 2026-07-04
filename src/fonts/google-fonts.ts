import type { FontAtlas } from "@/fonts/types";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";

const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com/css2";
const FONT_ATLAS_PATH = "/fonts/font-atlas.json";
const FONT_CHUNK_PATH_PREFIX = "/fonts/font-chunk-";

const fullLoaded = new Set<string>();

let cachedAtlas: FontAtlas | null = null;
let atlasFetchPromise: Promise<FontAtlas | null> | null = null;

function encodeGoogleFontsFamily(family: string): string {
	return family.replace(/ /g, "+");
}

export function getCachedFontAtlas(): FontAtlas | null {
	return cachedAtlas;
}

export function clearFontAtlasCache(): void {
	cachedAtlas = null;
	atlasFetchPromise = null;
	fullLoaded.clear();
}

export function loadFontAtlas(): Promise<FontAtlas | null> {
	if (cachedAtlas) return Promise.resolve(cachedAtlas);
	if (atlasFetchPromise) return atlasFetchPromise;

	atlasFetchPromise = fetch(FONT_ATLAS_PATH)
		.then(async (response) => {
			if (!response.ok) return null;
			const data: FontAtlas = await response.json();
			cachedAtlas = data;
			preloadChunkImages({ atlas: data });
			return data;
		})
		.catch(() => null);

	return atlasFetchPromise;
}

function preloadChunkImages({ atlas }: { atlas: FontAtlas }): void {
	const maxChunk = Math.max(
		...Object.values(atlas.fonts).map((entry) => entry.ch),
	);
	for (let i = 0; i <= maxChunk; i++) {
		// hint browser to preload chunk images without blocking
		const img = new Image();
		img.src = `${FONT_CHUNK_PATH_PREFIX}${i}.avif`;
	}
}

export async function loadFullFont({
	family,
	weights = [400, 500, 600, 700, 800, 900],
}: {
	family: string;
	weights?: number[];
}): Promise<void> {
	if (fullLoaded.has(family)) return;

	const encoded = encodeGoogleFontsFamily(family);
	// Google Fonts CSS2 returns 400 if ANY requested weight is unavailable for
	// the family (e.g. Bebas Neue only ships 400), which drops the whole font.
	// Try the full weight range, then fall back to the bare family (weight 400).
	const urls = [
		`${GOOGLE_FONTS_CSS}?family=${encoded}:wght@${weights.join(";")}&display=swap`,
		`${GOOGLE_FONTS_CSS}?family=${encoded}&display=swap`,
	];

	const loadCss = (href: string) =>
		new Promise<boolean>((resolve) => {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = href;
			link.addEventListener("load", () => resolve(true), { once: true });
			link.addEventListener("error", () => resolve(false), { once: true });
			document.head.appendChild(link);
		});

	let loaded = false;
	for (const href of urls) {
		// eslint-disable-next-line no-await-in-loop
		if (await loadCss(href)) {
			loaded = true;
			break;
		}
	}

	if (loaded) {
		await Promise.all(
			weights.map((weight) =>
				document.fonts
					.load(`${weight} 16px "${family.replace(/"/g, '\\"')}"`)
					.catch(() => undefined),
			),
		);
	}
	fullLoaded.add(family);
}

export async function loadFonts({
	families,
}: {
	families: string[];
}): Promise<void> {
	const googleFonts = families.filter((family) => !SYSTEM_FONTS.has(family));
	await Promise.all(googleFonts.map((family) => loadFullFont({ family })));
}
