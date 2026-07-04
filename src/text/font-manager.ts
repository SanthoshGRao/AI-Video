import WebFont from "webfontloader";

class FontManager {
	private loadedFonts = new Set<string>();

	public async loadGoogleFont(fontFamily: string): Promise<void> {
		if (this.loadedFonts.has(fontFamily)) {
			return; // Already loaded
		}

		return new Promise((resolve, reject) => {
			WebFont.load({
				google: {
					families: [`${fontFamily}:100,200,300,400,500,600,700,800,900`]
				},
				active: () => {
					this.loadedFonts.add(fontFamily);
					resolve();
				},
				inactive: () => {
					console.error(`Failed to load Google Font: ${fontFamily}`);
					// We might want to resolve anyway to not block the editor completely,
					// but it's better to know it failed.
					resolve();
				}
			});
		});
	}

	public async loadGoogleFonts(fontFamilies: string[]): Promise<void> {
		const toLoad = fontFamilies.filter(f => !this.loadedFonts.has(f));
		if (toLoad.length === 0) return;

		return new Promise((resolve) => {
			WebFont.load({
				google: {
					families: toLoad.map(f => `${f}:100,200,300,400,500,600,700,800,900`)
				},
				active: () => {
					toLoad.forEach(f => this.loadedFonts.add(f));
					resolve();
				},
				inactive: () => {
					resolve();
				}
			});
		});
	}
	
	public isFontLoaded(fontFamily: string): boolean {
		return this.loadedFonts.has(fontFamily);
	}
}

export const fontManager = new FontManager();
