import { useEffect, useState } from "react";
import { fetchFavoriteFonts } from "@/fonts/font-usage";

export function useFontFavorites({ open }: { open: boolean }) {
	const [favorites, setFavorites] = useState<string[]>([]);

	useEffect(() => {
		if (!open) return;
		fetchFavoriteFonts(true).then(setFavorites);
	}, [open]);

	return favorites;
}
