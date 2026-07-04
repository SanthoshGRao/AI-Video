import type { TScene } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { calculateTotalDuration } from "@/timeline";
import { MAIN_TRACK_NAME } from "@/timeline/placement/main-track";
import { DEFAULTS } from "./defaults";
import type { TextTrack, AudioTrack, TextElement } from "@/timeline";
import { type MediaTime, ZERO_MEDIA_TIME, mediaTimeFromSeconds } from "@/wasm";

export function getMainScene({ scenes }: { scenes: TScene[] }): TScene | null {
	return scenes.find((scene) => scene.isMain) || null;
}

export function ensureMainScene({ scenes }: { scenes: TScene[] }): TScene[] {
	const hasMain = scenes.some((scene) => scene.isMain);
	if (!hasMain) {
		const mainScene = buildDefaultScene({ name: "Main scene", isMain: true });
		return [mainScene, ...scenes];
	}
	return scenes;
}

function createTextElement({
	content,
	startTimeSeconds,
	durationSeconds,
	fontSize = 48,
	color = "#ffffff",
	positionY = 0,
}: {
	content: string;
	startTimeSeconds: number;
	durationSeconds: number;
	fontSize?: number;
	color?: string;
	positionY?: number;
}): TextElement {
	const startTicks = mediaTimeFromSeconds({ seconds: startTimeSeconds });
	const durationTicks = mediaTimeFromSeconds({ seconds: durationSeconds });
	return {
		id: generateUUID(),
		type: "text",
		name: "Text",
		duration: durationTicks,
		startTime: startTicks,
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {
			...DEFAULTS.text.element.params,
			content,
			fontSize,
			color,
			"transform.positionY": positionY,
		},
	};
}

function buildSubtitlesTrack(): TextTrack {
	const trackId = generateUUID();
	return {
		id: trackId,
		name: "Subtitles",
		type: "text",
		elements: [
			createTextElement({
				content: "Welcome to this beautiful 2.2 acre farmland near Mysore.",
				startTimeSeconds: 0,
				durationSeconds: 10,
				fontSize: 32,
				color: "#ffff00", // Yellow for subtitles
				positionY: 300,   // Bottom area of the screen
			}),
			createTextElement({
				content: "It is the perfect setting for a weekend farmhouse.",
				startTimeSeconds: 10,
				durationSeconds: 10,
				fontSize: 32,
				color: "#ffff00",
				positionY: 300,
			}),
			createTextElement({
				content: "Located just 25 kilometers from Mysuru, in a tranquil environment.",
				startTimeSeconds: 20,
				durationSeconds: 10,
				fontSize: 32,
				color: "#ffff00",
				positionY: 300,
			}),
			createTextElement({
				content: "It has a waterfall nearby and features easy maintenance.",
				startTimeSeconds: 30,
				durationSeconds: 10,
				fontSize: 32,
				color: "#ffff00",
				positionY: 300,
			}),
			createTextElement({
				content: "With irrigation setup ready and full electricity available.",
				startTimeSeconds: 40,
				durationSeconds: 10,
				fontSize: 32,
				color: "#ffff00",
				positionY: 300,
			}),
			createTextElement({
				content: "Contact us today to schedule a site visit via WhatsApp!",
				startTimeSeconds: 50,
				durationSeconds: 10,
				fontSize: 32,
				color: "#ffff00",
				positionY: 300,
			}),
		],
		hidden: false,
	};
}

function buildOverlayTextTrack(): TextTrack {
	const trackId = generateUUID();
	return {
		id: trackId,
		name: "Key Facts",
		type: "text",
		elements: [
			createTextElement({
				content: "📍 Mysore, Karnataka",
				startTimeSeconds: 2,
				durationSeconds: 8,
				fontSize: 48,
				color: "#ffffff",
				positionY: -200, // Top area
			}),
			createTextElement({
				content: "🌿 2.2 Acres Farmland",
				startTimeSeconds: 22,
				durationSeconds: 8,
				fontSize: 48,
				color: "#ffffff",
				positionY: -200,
			}),
			createTextElement({
				content: "⚡ Electricity & Water Ready",
				startTimeSeconds: 42,
				durationSeconds: 8,
				fontSize: 48,
				color: "#ffffff",
				positionY: -200,
			}),
		],
		hidden: false,
	};
}

function buildVoiceoverTrack(): AudioTrack {
	const trackId = generateUUID();
	const durationTicks = mediaTimeFromSeconds({ seconds: 60 });
	return {
		id: trackId,
		name: "Voice Over",
		type: "audio",
		elements: [
			{
				id: generateUUID(),
				type: "audio",
				sourceType: "library",
				sourceUrl: "/demo-voiceover.mp3",
				name: "demo-voiceover.mp3",
				duration: durationTicks,
				startTime: ZERO_MEDIA_TIME,
				trimStart: ZERO_MEDIA_TIME,
				trimEnd: ZERO_MEDIA_TIME,
				sourceDuration: durationTicks,
				params: {
					volume: 0,
					muted: false,
				},
			},
		],
		muted: false,
	};
}

export function buildDefaultScene({
	name,
	isMain,
}: {
	name: string;
	isMain: boolean;
}): TScene {
	return {
		id: generateUUID(),
		name,
		isMain,
		tracks: {
			overlay: [buildSubtitlesTrack(), buildOverlayTextTrack()],
			main: {
				id: generateUUID(),
				name: MAIN_TRACK_NAME,
				type: "video",
				elements: [],
				muted: false,
				hidden: false,
			},
			audio: [buildVoiceoverTrack()],
		},
		bookmarks: [],
		transitions: [],
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

export function canDeleteScene({ scene }: { scene: TScene }): {
	canDelete: boolean;
	reason?: string;
} {
	if (scene.isMain) {
		return { canDelete: false, reason: "Cannot delete main scene" };
	}
	return { canDelete: true };
}

export function getFallbackSceneAfterDelete({
	scenes,
	deletedSceneId,
	currentSceneId,
}: {
	scenes: TScene[];
	deletedSceneId: string;
	currentSceneId: string | null;
}): TScene | null {
	if (currentSceneId !== deletedSceneId) {
		return scenes.find((s) => s.id === currentSceneId) || null;
	}
	return getMainScene({ scenes });
}

export function findCurrentScene({
	scenes,
	currentSceneId,
}: {
	scenes: TScene[];
	currentSceneId: string;
}): TScene | null {
	return (
		scenes.find((s) => s.id === currentSceneId) ||
		getMainScene({ scenes }) ||
		scenes[0] ||
		null
	);
}

export function getProjectDurationFromScenes({
	scenes,
}: {
	scenes: TScene[];
}): MediaTime {
	const mainScene = getMainScene({ scenes }) ?? scenes[0] ?? null;
	if (!mainScene?.tracks) {
		return ZERO_MEDIA_TIME;
	}

	return calculateTotalDuration({ tracks: mainScene.tracks });
}

export function updateSceneInArray({
	scenes,
	sceneId,
	updates,
}: {
	scenes: TScene[];
	sceneId: string;
	updates: Partial<TScene>;
}): TScene[] {
	return scenes.map((scene) =>
		scene.id === sceneId ? { ...scene, ...updates } : scene,
	);
}
