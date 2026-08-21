import { useCallback, useEffect, useState } from "react";
import {
	fetchCustomFonts,
	getCachedCustomFonts,
	importCustomFont,
	deleteCustomFont,
	type CustomFontRecord,
} from "@/fonts/custom-fonts";

/** Fetches (and registers @font-face for) the user's imported fonts on mount —
 * unconditional so a previously-applied custom font renders correctly even
 * before the picker is ever opened. */
export function useCustomFonts() {
	const [fonts, setFonts] = useState<CustomFontRecord[]>(() => getCachedCustomFonts());
	const [importing, setImporting] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);

	useEffect(() => {
		fetchCustomFonts().then(setFonts);
	}, []);

	const addFont = useCallback(async (url: string, family?: string) => {
		setImporting(true);
		setImportError(null);
		try {
			const font = await importCustomFont({ url, family });
			setFonts((prev) => [font, ...prev.filter((f) => f.id !== font.id)]);
			return font;
		} catch (err) {
			setImportError(err instanceof Error ? err.message : "Failed to import font");
			throw err;
		} finally {
			setImporting(false);
		}
	}, []);

	const removeFont = useCallback(async (id: string) => {
		setFonts((prev) => prev.filter((f) => f.id !== id));
		await deleteCustomFont(id).catch(() => {
			// re-sync from server if delete failed so state doesn't drift
			fetchCustomFonts(true).then(setFonts);
		});
	}, []);

	return { fonts, importing, importError, addFont, removeFont, setImportError };
}
