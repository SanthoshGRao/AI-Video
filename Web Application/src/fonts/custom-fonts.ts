import { loadFullFont } from "@/fonts/google-fonts";

export interface CustomFontRecord {
	id: string;
	family: string;
	url: string;
	source: "file" | "google";
}

const registeredFamilies = new Set<string>();

let cached: CustomFontRecord[] | null = null;
let fetchPromise: Promise<CustomFontRecord[]> | null = null;

/** Registers @font-face rules for directly-uploaded font files. Lazy: the
 * browser only fetches the font file once it's actually needed to render
 * text, exactly like a normal CSS @font-face declaration. Google-sourced
 * custom fonts don't need this — they're loaded via loadFullFont() like any
 * other Google font. */
export function registerCustomFontFaces(fonts: CustomFontRecord[]): void {
	if (typeof document === "undefined" || !("fonts" in document)) return;
	for (const font of fonts) {
		if (font.source !== "file") continue;
		if (registeredFamilies.has(font.family)) continue;
		try {
			const face = new FontFace(font.family, `url("${font.url.replace(/"/g, "%22")}")`);
			document.fonts.add(face);
			registeredFamilies.add(font.family);
		} catch {
			// ignore malformed font registration; picker falls back to system font
		}
	}
}

export function getCachedCustomFonts(): CustomFontRecord[] {
	return cached ?? [];
}

export function fetchCustomFonts(force = false): Promise<CustomFontRecord[]> {
	if (cached && !force) return Promise.resolve(cached);
	if (fetchPromise && !force) return fetchPromise;

	fetchPromise = fetch("/api/fonts/custom")
		.then(async (res) => {
			if (!res.ok) return [];
			const data = await res.json();
			return (data.fonts ?? []) as CustomFontRecord[];
		})
		.catch(() => [])
		.then((fonts) => {
			cached = fonts;
			registerCustomFontFaces(fonts);
			fetchPromise = null;
			return fonts;
		});

	return fetchPromise;
}

export async function importCustomFont({
	url,
	family,
}: {
	url: string;
	family?: string;
}): Promise<CustomFontRecord> {
	const res = await fetch("/api/fonts/custom", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url, family }),
	});
	const data = await res.json().catch(() => ({}) as { error?: string; font?: CustomFontRecord });
	if (!res.ok) {
		throw new Error(data.error || "Failed to import font");
	}

	const font = data.font as CustomFontRecord;
	cached = [font, ...(cached ?? []).filter((f) => f.id !== font.id)];
	if (font.source === "file") {
		registerCustomFontFaces([font]);
	} else {
		// Load immediately so the "My fonts" list preview shows the real font,
		// not a fallback, right after import.
		loadFullFont({ family: font.family }).catch(() => {});
	}
	return font;
}

export async function deleteCustomFont(id: string): Promise<void> {
	const res = await fetch(`/api/fonts/custom/${id}`, { method: "DELETE" });
	if (!res.ok) throw new Error("Failed to delete font");
	cached = (cached ?? []).filter((f) => f.id !== id);
}
