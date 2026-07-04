import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { DEFAULTS } from "@/timeline/defaults";
import { buildTextElement } from "@/timeline/element-utils";
import type { MediaTime } from "@/wasm";

const TEXT_THEMES = [
	{
		id: "default",
		name: "Default Text",
		params: {
			fontFamily: "Inter",
			fontWeight: "400",
			color: "#ffffff",
			"background.enabled": false,
		},
		previewStyles: {
			fontFamily: "Inter, sans-serif",
			color: "#ffffff",
		}
	},
	{
		id: "subtitle-pill",
		name: "Subtitle Pill",
		params: {
			fontFamily: "Inter",
			fontWeight: "700",
			color: "#ffffff",
			"background.enabled": true,
			"background.color": "#000000",
			"background.cornerRadius": 16,
			"background.paddingX": 40,
			"background.paddingY": 30,
		},
		previewStyles: {
			fontFamily: "Inter, sans-serif",
			fontWeight: "700",
			color: "#ffffff",
			backgroundColor: "#000000",
			borderRadius: "8px",
			padding: "4px 8px",
		}
	},
	{
		id: "bold-yellow",
		name: "Bold Yellow",
		params: {
			fontFamily: "Montserrat",
			fontWeight: "900",
			color: "#FFD700",
			textTransform: "uppercase",
			"background.enabled": false,
		},
		previewStyles: {
			fontFamily: "Montserrat, sans-serif",
			fontWeight: "900",
			color: "#FFD700",
			textTransform: "uppercase" as const,
		}
	},
	{
		id: "elegant",
		name: "Elegant Serif",
		params: {
			fontFamily: "Playfair Display",
			fontWeight: "700",
			fontStyle: "italic",
			color: "#F5F5DC",
			"background.enabled": false,
		},
		previewStyles: {
			fontFamily: "'Playfair Display', serif",
			fontWeight: "700",
			fontStyle: "italic",
			color: "#F5F5DC",
		}
	},
	{
		id: "neon-glow",
		name: "Neon Glow",
		params: {
			fontFamily: "Oswald",
			fontWeight: "700",
			color: "#ffffff",
			textShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff",
			textTransform: "uppercase",
			"background.enabled": false,
		},
		previewStyles: {
			fontFamily: "Oswald, sans-serif",
			fontWeight: "700",
			color: "#ffffff",
			textShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff",
			textTransform: "uppercase" as const,
		}
	},
	{
		id: "outlined-impact",
		name: "Outlined",
		params: {
			fontFamily: "Impact, sans-serif",
			fontWeight: "900",
			color: "#ffffff",
			webkitTextStroke: "2px #000000",
			textTransform: "uppercase",
			"background.enabled": false,
		},
		previewStyles: {
			fontFamily: "Impact, sans-serif",
			fontWeight: "900",
			color: "#ffffff",
			WebkitTextStroke: "1px #000000",
			textTransform: "uppercase" as const,
		}
	},
	{
		id: "cinematic",
		name: "Cinematic",
		params: {
			fontFamily: "Lato",
			fontWeight: "400",
			color: "#ffffff",
			letterSpacing: 10,
			textTransform: "uppercase",
			"background.enabled": false,
		},
		previewStyles: {
			fontFamily: "Lato, sans-serif",
			fontWeight: "400",
			color: "#ffffff",
			letterSpacing: "4px", // Scaled down for preview
			textTransform: "uppercase" as const,
		}
	},
	{
		id: "modern-badge",
		name: "Modern Badge",
		params: {
			fontFamily: "Poppins",
			fontWeight: "600",
			color: "#ffffff",
			"background.enabled": true,
			"background.color": "#ef4444",
			"background.cornerRadius": 4,
			"background.paddingX": 24,
			"background.paddingY": 16,
		},
		previewStyles: {
			fontFamily: "Poppins, sans-serif",
			fontWeight: "600",
			color: "#ffffff",
			backgroundColor: "#ef4444",
			borderRadius: "4px",
			padding: "4px 8px",
		}
	},
	{
		id: "holographic",
		name: "Holographic",
		params: {
			fontFamily: "Raleway",
			fontWeight: "800",
			color: "#00ffff",
			textShadow: "2px 2px 0px #ff00ff",
			textTransform: "uppercase",
			"background.enabled": false,
		},
		previewStyles: {
			fontFamily: "Raleway, sans-serif",
			fontWeight: "800",
			color: "#00ffff",
			textShadow: "2px 2px 0px #ff00ff",
			textTransform: "uppercase" as const,
		}
	}
];

export function TextView() {
	const editor = useEditor();

	const handleThemeAction = ({ currentTime, theme }: { currentTime: MediaTime, theme: typeof TEXT_THEMES[0] }) => {
		const activeScene = editor.scenes.getActiveSceneOrNull();
		if (!activeScene) return;

		const selectedElements = editor.selection.getSelectedElements();
		
		// Find all selected text or caption elements across tracks
		const textElementsToUpdate: { trackId: string, element: any }[] = [];
		
		for (const ref of selectedElements) {
			const track = activeScene.tracks.overlay.find(t => t.id === ref.trackId);
			if (track) {
				const element = track.elements.find(e => e.id === ref.elementId);
				if (element && (element.type === "text" || element.type === "caption")) {
					textElementsToUpdate.push({ trackId: ref.trackId, element });
				}
			}
		}

		if (textElementsToUpdate.length > 0) {
			// Update existing elements with theme params
			const updates = textElementsToUpdate.map(({ trackId, element }) => ({
				trackId,
				elementId: element.id,
				patch: {
					params: {
						...element.params,
						...theme.params,
					}
				}
			}));
			
			editor.timeline.updateElements({ updates });
		} else {
			// Add new text element to timeline
			const element = buildTextElement({
				raw: {
					...DEFAULTS.text.element,
					params: {
						...DEFAULTS.text.element.params,
						...theme.params,
					}
				},
				startTime: currentTime,
			});

			editor.timeline.insertElement({
				element,
				placement: { mode: "auto" },
			});
		}
	};

	return (
		<PanelView title="Text Themes">
			<div className="grid gap-2 grid-cols-2">
				{TEXT_THEMES.map((theme) => (
					<DraggableItem
						key={theme.id}
						name={theme.name}
						preview={
							<div className="bg-accent flex size-full items-center justify-center rounded">
								<span className="text-xs select-none" style={theme.previewStyles}>
									{theme.name}
								</span>
							</div>
						}
						dragData={{
							id: `theme-${theme.id}`,
							type: DEFAULTS.text.element.type,
							name: theme.name,
							content: "Default text",
						}}
						aspectRatio={16/9}
						onAddToTimeline={({ currentTime }) => handleThemeAction({ currentTime, theme })}
						shouldShowLabel={false}
					/>
				))}
			</div>
		</PanelView>
	);
}
