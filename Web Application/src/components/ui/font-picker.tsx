"use client";

import { useState, useMemo, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { List, type RowComponentProps } from "react-window";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { recordFontUsage } from "@/fonts/font-usage";
import { useCustomFonts } from "@/fonts/use-custom-fonts";
import { useFontFavorites } from "@/fonts/use-font-favorites";
import type { FontAtlas, FontAtlasEntry } from "@/fonts/types";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import { cn } from "@/utils/ui";
import { ChevronDown, Loader2, Plus, Search, Trash2, Type } from "lucide-react";

const FONT_TABS = [
	{ key: "all", label: "All fonts" },
	{ key: "my-fonts", label: "My fonts" },
	{ key: "favorites", label: "Favorites" },
] as const;

type FontTab = (typeof FONT_TABS)[number]["key"];

const ROW_HEIGHT = 40;
const PREVIEW_SCALE = 0.8;
const LIST_WIDTH = 288;
const MAX_LIST_HEIGHT = 288;
const OVERSCAN = 15;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<FontTab>("all");
	const [importUrl, setImportUrl] = useState("");
	const [importName, setImportName] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const { atlas, status, fontNames, retry: handleRetry } = useFontAtlas({ open });
	const { fonts: customFonts, importing, importError, addFont, removeFont, setImportError } =
		useCustomFonts();
	const favorites = useFontFavorites({ open });

	const customFontIds = useMemo(
		() => new Map(customFonts.map((f) => [f.family, f.id])),
		[customFonts],
	);

	const customFontSources = useMemo(
		() => new Map(customFonts.map((f) => [f.family, f.source])),
		[customFonts],
	);

	const allFontNames = useMemo(() => {
		const names = new Set(fontNames);
		for (const font of customFonts) names.add(font.family);
		return Array.from(names).sort();
	}, [fontNames, customFonts]);

	const baseFonts = useMemo(() => {
		if (activeTab === "my-fonts") return customFonts.map((f) => f.family);
		if (activeTab === "favorites") return favorites;
		return allFontNames;
	}, [activeTab, customFonts, favorites, allFontNames]);

	const filteredFonts = useMemo(() => {
		if (!search) return baseFonts;
		const query = search.toLowerCase();
		return baseFonts.filter((name) => name.toLowerCase().includes(query));
	}, [baseFonts, search]);

	const listHeight = Math.min(
		MAX_LIST_HEIGHT,
		filteredFonts.length * ROW_HEIGHT,
	);

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			// Custom file-uploaded fonts are already registered as a lazy
			// FontFace; everything else (system fonts aside) loads via the
			// Google Fonts CSS2 API, same as a custom Google-sourced import.
			if (!SYSTEM_FONTS.has(family) && customFontSources.get(family) !== "file") {
				try {
					await loadFullFont({ family });
				} catch {
					// ignore load failure, font will fall back to system default
				}
			}
			recordFontUsage(family);
			onValueChange?.(family);
			setOpen(false);
		},
		[onValueChange, customFontSources],
	);

	const handleImport = useCallback(async () => {
		const url = importUrl.trim();
		if (!url) return;
		try {
			await addFont(url, importName.trim() || undefined);
			setImportUrl("");
			setImportName("");
		} catch {
			// error surfaced via importError state
		}
	}, [importUrl, importName, addFont]);

	const handleDeleteCustomFont = useCallback(
		(id: string) => {
			void removeFont(id);
		},
		[removeFont],
	);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setActiveTab("all");
			setImportUrl("");
			setImportName("");
			setImportError(null);
		}
	}, [open, setImportError]);

	const activeTabLabel =
		FONT_TABS.find((t) => t.key === activeTab)?.label.toLowerCase() ?? "";

	const emptyMessage = useMemo(() => {
		if (activeTab === "my-fonts") {
			return search
				? "No matching fonts."
				: "No fonts imported yet — paste a font file URL above to add one.";
		}
		if (activeTab === "favorites") {
			return search
				? "No matching favorites."
				: "Fonts you use most will show up here.";
		}
		return "No fonts found.";
	}, [activeTab, search]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground shrink-0">
						<Type className="size-3.5" />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{defaultValue ?? "Select a font"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 p-0 overflow-hidden"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 shrink-0 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder={`Search ${activeTabLabel}...`}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full pl-5 bg-transparent border-none! shadow-none!"
					/>
				</div>
				<div className="flex border-b px-3">
					{FONT_TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								"px-3 py-1.5 text-xs border-b-2 -mb-px",
								activeTab === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
						</button>
					))}
				</div>
				{activeTab === "my-fonts" && (
					<div className="flex flex-col gap-1.5 border-b p-2">
						<Input
							placeholder="Google Fonts link or a font file URL"
							value={importUrl}
							onChange={(event) => setImportUrl(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void handleImport();
								}
							}}
							size="xs"
						/>
						<div className="flex gap-1.5">
							<Input
								placeholder="Name (optional)"
								value={importName}
								onChange={(event) => setImportName(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void handleImport();
									}
								}}
								size="xs"
								className="flex-1"
							/>
							<Button
								size="icon"
								disabled={!importUrl.trim() || importing}
								onClick={() => void handleImport()}
								aria-label="Import font"
							>
								{importing ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Plus className="size-3.5" />
								)}
							</Button>
						</div>
						{importError && (
							<p className="text-xs text-destructive">{importError}</p>
						)}
					</div>
				)}
				{status === "loading" && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Loading fonts...
					</div>
				)}
				{status === "error" && (
					<div className="flex flex-col items-center gap-3 py-8 px-4">
						<p className="text-sm text-muted-foreground text-center">
							Failed to load font previews.
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							Retry
						</Button>
					</div>
				)}
				{status === "idle" && filteredFonts.length === 0 && (
					<div className="py-6 text-center text-sm text-muted-foreground px-4">
						{emptyMessage}
					</div>
				)}
				{status === "idle" && atlas && filteredFonts.length > 0 && (
					<List
						rowCount={filteredFonts.length}
						rowHeight={ROW_HEIGHT}
						overscanCount={OVERSCAN}
						rowComponent={FontRow}
						rowProps={{
							atlas,
							filteredFonts,
							selectedFont: defaultValue,
							onFontSelect: handleSelect,
							showDelete: activeTab === "my-fonts",
							customFontIds,
							onFontDelete: handleDeleteCustomFont,
						}}
						style={{ height: listHeight, width: LIST_WIDTH }}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

function FontSpritePreview({ entry }: { entry: FontAtlasEntry }) {
	return (
		<div
			className="shrink-0"
			style={{
				width: entry.w,
				height: ROW_HEIGHT,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				WebkitMaskPosition: `-${entry.x}px -${entry.y}px`,
				WebkitMaskRepeat: "no-repeat",
				maskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				maskPosition: `-${entry.x}px -${entry.y}px`,
				maskRepeat: "no-repeat",
				transform: `scale(${PREVIEW_SCALE})`,
				transformOrigin: "left center",
			}}
		/>
	);
}

type FontRowProps = {
	atlas: FontAtlas;
	filteredFonts: string[];
	selectedFont: string | undefined;
	onFontSelect: (params: { family: string }) => void;
	showDelete: boolean;
	customFontIds: Map<string, string>;
	onFontDelete: (id: string) => void;
};

function FontRow({
	index,
	style,
	atlas,
	filteredFonts,
	selectedFont,
	onFontSelect,
	showDelete,
	customFontIds,
	onFontDelete,
}: RowComponentProps<FontRowProps>) {
	const fontName = filteredFonts[index];
	const entry = atlas.fonts[fontName];
	const isSelected = fontName === selectedFont;
	const customFontId = customFontIds.get(fontName);

	return (
		<div
			style={style as CSSProperties}
			className={cn(
				"group flex w-full items-center gap-1 pr-1 outline-hidden hover:bg-popover-hover",
				isSelected && "bg-popover-hover",
			)}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-0 outline-hidden overflow-hidden"
				onClick={() => onFontSelect({ family: fontName })}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onFontSelect({ family: fontName });
					}
				}}
				aria-label={fontName}
			>
				<div className="min-w-0 overflow-hidden">
					{entry ? (
						<FontSpritePreview entry={entry} />
					) : (
						<span
							className="text-xl text-foreground/85 truncate block"
							style={{ fontFamily: fontName }}
						>
							{fontName}
						</span>
					)}
				</div>
			</button>
			{showDelete && customFontId && (
				<button
					type="button"
					className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 cursor-pointer"
					aria-label={`Remove ${fontName}`}
					onClick={(event) => {
						event.stopPropagation();
						onFontDelete(customFontId);
					}}
				>
					<Trash2 className="size-3.5" />
				</button>
			)}
		</div>
	);
}
