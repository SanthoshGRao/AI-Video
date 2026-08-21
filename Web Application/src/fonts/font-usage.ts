let cachedFavorites: string[] | null = null;
let fetchPromise: Promise<string[]> | null = null;

export function fetchFavoriteFonts(force = false): Promise<string[]> {
	if (cachedFavorites && !force) return Promise.resolve(cachedFavorites);
	if (fetchPromise && !force) return fetchPromise;

	fetchPromise = fetch("/api/fonts/usage")
		.then(async (res) => {
			if (!res.ok) return [];
			const data = await res.json();
			return (data.favorites ?? []) as string[];
		})
		.catch(() => [])
		.then((favorites) => {
			cachedFavorites = favorites;
			fetchPromise = null;
			return favorites;
		});

	return fetchPromise;
}

/** Fire-and-forget: bumps this family's usage count so it climbs the Favorites tab. */
export function recordFontUsage(family: string): void {
	cachedFavorites = null;
	fetch("/api/fonts/usage", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ family }),
	}).catch(() => {});
}
