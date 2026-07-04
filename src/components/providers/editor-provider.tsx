"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsListener } from "@/actions/use-keybindings";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditorActions } from "@/actions/use-editor-actions";
import { loadFontAtlas } from "@/fonts/google-fonts";
import {
	initializeGpuRenderer,
	isGpuAvailable,
} from "@/services/renderer/gpu-renderer";
import { DEFAULTS } from "@/timeline/defaults";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { getElementFontFamilies } from "@/timeline/element-utils";
import { loadFonts } from "@/fonts/google-fonts";
import { floatToFrameRate } from "@/fps/utils";
import {
	downloadBuffer,
	getExportFileExtension,
	getExportMimeType,
	type ExportFormat,
	type ExportQuality,
} from "@/export";

interface EditorProviderProps {
	projectId: string;
	children: React.ReactNode;
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { setLoadingProject } = useKeybindingsStore();

	useEffect(() => {
		setLoadingProject(isLoading);
	}, [isLoading, setLoadingProject]);

	useEffect(() => {
		let cancelled = false;
		const editor = EditorCore.getInstance();

		const mapElement = (el: any, mediaList: any[], incomingProject: any): any => {
			const startTicks = mediaTimeFromSeconds({ seconds: el.startTime / 1000 });
			const durationTicks = mediaTimeFromSeconds({ seconds: el.duration / 1000 });
			const trimStartTicks = mediaTimeFromSeconds({ seconds: el.trimStart / 1000 });
			const trimEndTicks = mediaTimeFromSeconds({ seconds: el.trimEnd / 1000 });

			if (el.type === "text") {
				const canvasWidth = incomingProject?.settings?.canvasSize?.width || 1080;
				const canvasHeight = incomingProject?.settings?.canvasSize?.height || 1920;

				const x = el.params?.x !== undefined ? el.params.x : 80;
				const y = el.params?.y !== undefined ? el.params.y : (el.role === "subtitle" ? 1480 : 260);
				const w = el.params?.width !== undefined ? el.params.width : 920;
				const h = el.params?.height !== undefined ? el.params.height : (el.role === "subtitle" ? 160 : 120);

				const centerX = x + w / 2;
				const centerY = y + h / 2;

				const posX = centerX - canvasWidth / 2;
				const posY = centerY - canvasHeight / 2;

				// Map font size. Scale factor is canvasHeight / 90.
				const scaleFactor = canvasHeight / 90;
				const incomingFontSize = el.params?.fontSize || (el.role === "subtitle" ? 54 : 58);
				const openCutFontSize = incomingFontSize / scaleFactor;

				return {
					id: el.id,
					type: "text",
					role: el.role,
					cueId: el.cueId,
					name: el.name || "Text",
					duration: durationTicks,
					startTime: startTicks,
					trimStart: trimStartTicks,
					trimEnd: trimEndTicks,
					params: {
						...DEFAULTS.text.element.params,
						...el.params,
						content: el.text || "",
						fontSize: openCutFontSize,
						color: el.params?.color || "#ffffff",
						"transform.positionX": el.params?.["transform.positionX"] !== undefined ? el.params["transform.positionX"] : posX,
						"transform.positionY": el.params?.["transform.positionY"] !== undefined ? el.params["transform.positionY"] : posY,
						"transform.scaleX": el.params?.["transform.scaleX"] !== undefined ? el.params["transform.scaleX"] : (el.params?.scale || 1),
						"transform.scaleY": el.params?.["transform.scaleY"] !== undefined ? el.params["transform.scaleY"] : (el.params?.scale || 1),
						"transform.rotate": el.params?.["transform.rotate"] !== undefined ? el.params["transform.rotate"] : (el.params?.rotation || 0),
					},
				};
			}

			if (el.type === "audio") {
				const asset = mediaList.find(m => m.id === el.mediaId);
				const sourceUrl = asset ? asset.url : "/demo-voiceover.mp3";
				return {
					id: el.id,
					type: "audio",
					mediaId: el.mediaId,
					sourceType: "library",
					sourceUrl,
					name: el.name || "Audio",
					duration: durationTicks,
					startTime: startTicks,
					trimStart: trimStartTicks,
					trimEnd: trimEndTicks,
					sourceDuration: durationTicks,
					params: {
						volume: el.params?.volume !== undefined ? el.params.volume : 0, // In OpenCut 0 dB = standard volume (linear gain = 1.0)
						muted: el.params?.muted || false,
					},
				};
			}

			if (el.type === "video" || el.type === "image") {
				const asset = mediaList.find(m => m.id === el.mediaId);
				const sourceUrl = asset ? asset.url : "";
				return {
					id: el.id,
					type: el.type,
					mediaId: el.mediaId,
					name: el.name || "Media",
					duration: durationTicks,
					startTime: startTicks,
					trimStart: trimStartTicks,
					trimEnd: trimEndTicks,
					sourceDuration: durationTicks,
					params: {
						...DEFAULTS.text.element.params,
						...el.params,
					},
				};
			}

			return el;
		};

		const loadProjectFromData = async (incomingProject: any) => {
			try {
				setIsLoading(true);
				await initializeGpuRenderer();
				editor.renderer.setDegraded(!isGpuAvailable());

				editor.save.pause();
				editor.media.clearAllAssets();
				editor.scenes.clearScenes();

				const assets = await Promise.all(incomingProject.media.map(async (asset: any) => {
					let file = asset.file;
					if (!file && asset.url && (asset.type === 'video' || asset.type === 'VIDEO' || asset.type === 'image' || asset.type === 'IMAGE')) {
						try {
							const res = await fetch(asset.url);
							if (res.ok) {
								const blob = await res.blob();
								file = new File([blob], asset.name || asset.id, { type: blob.type || (String(asset.type).toLowerCase() === 'video' ? 'video/mp4' : 'image/jpeg') });
							}
						} catch (err) {
							console.error("Failed to fetch media file for hydration:", err);
						}
					}
					return {
						id: asset.id,
						name: asset.name || asset.id,
						originalName: asset.name || asset.id,
						type: String(asset.type).toLowerCase(),
						url: asset.url,
						file,
						width: asset.width,
						height: asset.height,
						thumbnailUrl: asset.thumbnailUrl,
						durationMs: asset.durationMs,
						duration: asset.duration,
					};
				}));

				editor.media.setAssets({ assets });

				const scenes = [
					{
						id: incomingProject.scene.id,
						name: incomingProject.scene.name,
						isMain: incomingProject.scene.isMain,
						bookmarks: [],
						tracks: {
							main: {
								id: incomingProject.scene.tracks.main.id,
								name: incomingProject.scene.tracks.main.name,
								type: "video" as const,
								elements: incomingProject.scene.tracks.main.elements.map((el: any) => mapElement(el, incomingProject.media, incomingProject)),
								muted: incomingProject.scene.tracks.main.muted ?? false,
								hidden: incomingProject.scene.tracks.main.hidden ?? false,
							},
							overlay: incomingProject.scene.tracks.overlay.map((track: any) => ({
								id: track.id,
								name: track.name,
								type: track.type === "text" ? "text" : "video",
								elements: track.elements.map((el: any) => mapElement(el, incomingProject.media, incomingProject)),
								hidden: track.hidden ?? false,
							})),
							audio: incomingProject.scene.tracks.audio.map((track: any) => ({
								id: track.id,
								name: track.name,
								type: "audio",
								elements: track.elements.map((el: any) => mapElement(el, incomingProject.media, incomingProject)),
								muted: track.muted ?? false,
							})),
						},
						createdAt: new Date(),
						updatedAt: new Date(),
					}
				];

				const mappedProject: any = {
					metadata: {
						id: incomingProject.id,
						name: incomingProject.name,
						duration: mediaTimeFromSeconds({ seconds: incomingProject.durationMs / 1000 }),
						createdAt: new Date(),
						updatedAt: new Date(),
					},
					scenes,
					currentSceneId: incomingProject.scene.id,
					settings: {
						fps: floatToFrameRate(incomingProject.settings.fps || 30),
						canvasSize: incomingProject.settings.canvasSize,
						canvasSizeMode: "preset",
						background: incomingProject.settings.background,
					},
					version: 1,
				};

				editor.project.setActiveProject({ project: mappedProject });
				editor.scenes.initializeScenes({
					scenes: mappedProject.scenes,
					currentSceneId: mappedProject.currentSceneId,
				});

				await loadFonts({
					families: [
						...new Set(
							scenes.flatMap((scene) =>
								getElementFontFamilies({ tracks: scene.tracks }),
							),
						),
					],
				});

				setIsLoading(false);
				loadFontAtlas();
				editor.save.resume();
			} catch (err) {
				console.error("Failed to load project from postMessage:", err);
				setError("Failed to load project data");
				setIsLoading(false);
			}
		};

		const exportProjectToBrowser = async (options?: {
			format?: ExportFormat;
			quality?: ExportQuality;
			includeAudio?: boolean;
		}) => {
			try {
				const activeProject = editor.project.getActiveOrNull();
				if (!activeProject) throw new Error("No active project to export");

				const format = options?.format ?? "mp4";
				const result = await editor.project.export({
					options: {
						format,
						quality: options?.quality ?? "high",
						includeAudio: options?.includeAudio ?? true,
						fps: activeProject.settings.fps,
					},
				});

				if (result.cancelled) {
					window.parent.postMessage({ type: "EXPORT_CANCELLED" }, "*");
					return;
				}

				if (!result.success || !result.buffer) {
					throw new Error(result.error || "Export failed");
				}

				const safeName =
					activeProject.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() ||
					"export";

				downloadBuffer({
					buffer: result.buffer,
					filename: `${safeName}${getExportFileExtension({ format })}`,
					mimeType: getExportMimeType({ format }),
				});

				editor.project.clearExportState();
				window.parent.postMessage({ type: "EXPORT_DONE" }, "*");
			} catch (err) {
				editor.project.clearExportState();
				window.parent.postMessage(
					{
						type: "EXPORT_ERROR",
						error: err instanceof Error ? err.message : "Export failed",
					},
					"*",
				);
			}
		};

		const unsubscribeExportProgress = editor.project.subscribe(() => {
			const state = editor.project.getExportState();
			if (state.isExporting && window.parent !== window) {
				window.parent.postMessage(
					{ type: "EXPORT_PROGRESS", progress: state.progress * 100 },
					"*",
				);
			}
		});

		const handleMessage = (event: MessageEvent) => {
			if (event.data && event.data.type === "LOAD_PROJECT") {
				loadProjectFromData(event.data.project);
			}
			if (event.data && event.data.type === "REQUEST_PROJECT_SNAPSHOT") {
				window.parent.postMessage(
					{
						type: "PROJECT_SNAPSHOT",
						requestId: event.data.requestId,
						project: getSerializedProject(editor),
					},
					"*",
				);
			}
			if (event.data && event.data.type === "EXPORT_PROJECT") {
				void exportProjectToBrowser(event.data.options);
			}
			if (event.data && event.data.type === "CANCEL_EXPORT") {
				editor.project.cancelExport();
			}
		};

		window.addEventListener("message", handleMessage);


		const loadProject = async () => {
			try {
				setIsLoading(true);
				await initializeGpuRenderer();
				editor.renderer.setDegraded(!isGpuAvailable());
				await editor.project.loadProject({ id: projectId });

				if (cancelled) return;

				setIsLoading(false);
				loadFontAtlas();
			} catch (err) {
				if (cancelled) return;

				const isNotFound =
					err instanceof Error &&
					(err.message.includes("not found") ||
						err.message.includes("does not exist"));

				if (isNotFound) {
					try {
						const newProjectId = await editor.project.createNewProject({
							name: "Untitled Project",
						});
						router.replace(`/editor/${newProjectId}`);
					} catch (_createErr) {
						setError("Failed to create project");
						setIsLoading(false);
					}
				} else {
					const wasmPanic = (window as Window & { __wasmPanic?: string })
						.__wasmPanic;
					if (wasmPanic) {
						delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
						setError(wasmPanic);
					} else {
						setError(
							err instanceof Error ? err.message : "Failed to load project",
						);
					}
					setIsLoading(false);
				}
			} finally {
				// Notify parent that editor is ready to receive project
				if (window.parent !== window) {
					window.parent.postMessage({ type: "EDITOR_READY" }, "*");
				}
			}
		};

		loadProject();

		return () => {
			cancelled = true;
			window.removeEventListener("message", handleMessage);
			unsubscribeExportProgress();
		};
	}, [projectId, router]);

	if (error) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Loading project...</p>
				</div>
			</div>
		);
	}

	if (!activeProject) {
		return (
			<div className="bg-background flex h-screen w-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<p className="text-muted-foreground text-sm">Exiting project...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<EditorRuntimeBindings />
			{children}
		</>
	);
}

const getSerializedProject = (editor: any): any => {
	const activeProject = editor.project.getActiveOrNull();
	if (!activeProject) return null;

	const scenes = editor.scenes.getScenes();
	const currentScene = editor.scenes.getActiveSceneOrNull() || scenes[0];
	if (!currentScene) return null;

	const mapElementToIncoming = (el: any): any => {
		const startMs = mediaTimeToSeconds({ time: el.startTime }) * 1000;
		const durationMs = mediaTimeToSeconds({ time: el.duration }) * 1000;
		const trimStartMs = mediaTimeToSeconds({ time: el.trimStart }) * 1000;
		const trimEndMs = mediaTimeToSeconds({ time: el.trimEnd }) * 1000;

		const canvasWidth = activeProject.settings.canvasSize?.width || 1080;
		const canvasHeight = activeProject.settings.canvasSize?.height || 1920;
		const scaleFactor = canvasHeight / 90;

		const params = { ...el.params };

		const posX = el.params["transform.positionX"] !== undefined ? Number(el.params["transform.positionX"]) : 0;
		const posY = el.params["transform.positionY"] !== undefined ? Number(el.params["transform.positionY"]) : (el.role === "subtitle" ? 600 : -640);
		
		const w = el.params.width !== undefined ? Number(el.params.width) : 920;
		const h = el.params.height !== undefined ? Number(el.params.height) : (el.role === "subtitle" ? 160 : 120);

		const x = posX + canvasWidth / 2 - w / 2;
		const y = posY + canvasHeight / 2 - h / 2;

		const openCutFontSize = el.params.fontSize || (el.role === "subtitle" ? 2.5 : 3.0);
		const fontSize = openCutFontSize * scaleFactor;

		params.x = x;
		params.y = y;
		params.width = w;
		params.height = h;
		params.fontSize = fontSize;
		params.scale = el.params["transform.scaleX"] ?? 1;
		params.rotation = el.params["transform.rotate"] ?? 0;

		return {
			id: el.id,
			name: el.name,
			type: el.type,
			mediaId: el.mediaId,
			role: el.role,
			cueId: el.cueId,
			text: el.params?.content || el.text || "",
			startTime: startMs,
			duration: durationMs,
			trimStart: trimStartMs,
			trimEnd: trimEndMs,
			params,
		};
	};

	const mapTrackToIncoming = (track: any): any => {
		return {
			id: track.id,
			name: track.name,
			type: track.type,
			elements: (track.elements || []).map(mapElementToIncoming),
			hidden: track.hidden ?? false,
			muted: track.muted ?? false,
		};
	};

	const mappedScene = {
		id: currentScene.id,
		name: currentScene.name,
		isMain: currentScene.isMain,
		tracks: {
			main: mapTrackToIncoming(currentScene.tracks.main),
			overlay: (currentScene.tracks.overlay || []).map(mapTrackToIncoming),
			audio: (currentScene.tracks.audio || []).map(mapTrackToIncoming),
		},
	};

	const fps = activeProject.settings.fps.numerator / activeProject.settings.fps.denominator;
	const durationMs = mediaTimeToSeconds({ time: activeProject.metadata.duration }) * 1000;

	const media = editor.media.getAssets().map((asset: any) => ({
		id: asset.id,
		name: asset.name || asset.originalName || asset.id,
		type: asset.type,
		url: asset.url,
		file: asset.file,
		size: asset.size ?? asset.file?.size,
		lastModified: asset.lastModified ?? asset.file?.lastModified,
		width: asset.width,
		height: asset.height,
		thumbnailUrl: asset.thumbnailUrl,
		durationMs: asset.durationMs,
		duration: asset.duration,
	}));

	return {
		id: activeProject.metadata.id,
		name: activeProject.metadata.name,
		version: activeProject.version || 1,
		media,
		durationMs,
		settings: {
			fps,
			canvasSize: activeProject.settings.canvasSize,
			background: activeProject.settings.background,
		},
		scene: mappedScene,
	};
};

function EditorRuntimeBindings() {
	const editor = useEditor();
	const rippleEditingEnabled = useTimelineStore(
		(state) => state.rippleEditingEnabled,
	);

	useEffect(() => {
		editor.command.isRippleEnabled = rippleEditingEnabled;
	}, [editor, rippleEditingEnabled]);

	useEffect(() => {
		let timeoutId: any = null;

		const handleSave = () => {
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				const project = getSerializedProject(editor);
				if (project && window.parent !== window) {
					window.parent.postMessage({ type: "PROJECT_UPDATED", project }, "*");
				}
			}, 300);
		};

		const unsubProject = editor.project.subscribe(handleSave);
		const unsubScenes = editor.scenes.subscribe(handleSave);
		const unsubTimeline = editor.timeline.subscribe(handleSave);

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			unsubProject();
			unsubScenes();
			unsubTimeline();
		};
	}, [editor]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!editor.save.getIsDirty()) return;
			event.preventDefault();
			(event as unknown as { returnValue: string }).returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [editor]);

	useEditorActions();
	useKeybindingsListener();
	return null;
}
