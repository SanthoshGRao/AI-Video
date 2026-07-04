"use client";

import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TimelineElement } from "./timeline-element";
import type { TimelineTrack } from "@/timeline";
import type { TimelineElement as TimelineElementType } from "@/timeline";
import { TIMELINE_LAYERS } from "./layers";
import type { ElementDragView } from "@/timeline";
import { useEditor } from "@/editor/use-editor";
import { timelineTimeToSnappedPixels, getTimelinePixelsPerSecond } from "@/timeline";

interface TimelineTrackContentProps {
	track: TimelineTrack;
	zoomLevel: number;
	dragView: ElementDragView;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onTrackMouseDown?: (event: React.MouseEvent) => void;
	onTrackMouseUp?: (event: React.MouseEvent) => void;
	shouldIgnoreClick?: () => boolean;
	targetElementId?: string | null;
}

export function TimelineTrackContent({
	track,
	zoomLevel,
	dragView,
	onResizeStart,
	onElementMouseDown,
	onElementClick,
	onTrackMouseDown,
	onTrackMouseUp,
	shouldIgnoreClick,
	targetElementId = null,
}: TimelineTrackContentProps) {
	const { isElementSelected } = useElementSelection();
	const editor = useEditor();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const transitions = scene?.transitions || [];
	const timelinePixelsPerSecond = getTimelinePixelsPerSecond({ zoomLevel });

	// Filter transitions that belong to elements in this track
	const trackElementIds = new Set(track.elements.map(e => e.id));
	const trackTransitions = transitions.filter((t: any) => trackElementIds.has(t.clipAId) || trackElementIds.has(t.clipBId));

	return (
		<div className="relative size-full">
			<button
				type="button"
				className="absolute inset-0 m-0 size-full appearance-none border-0 bg-transparent p-0"
				aria-label={`Select ${track.name} track`}
				onMouseUp={(event) => {
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			/>
			<div
				className="relative h-full min-w-full"
				style={{ zIndex: TIMELINE_LAYERS.trackContent }}
				onMouseUp={(event) => {
					if (event.target !== event.currentTarget) return;
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			>
				{track.elements.length === 0 ? (
					<div className="text-muted-foreground border-muted/30 pointer-events-none flex size-full items-center justify-center rounded-sm border-2 border-dashed text-xs" />
				) : (
					track.elements.map((element) => {
						const isSelected = isElementSelected({
							trackId: track.id,
							elementId: element.id,
						});

						return (
							<TimelineElement
								key={element.id}
								element={element}
								track={track}
								zoomLevel={zoomLevel}
								isSelected={isSelected}
								onResizeStart={({ event, element, side }) =>
									onResizeStart({ event, element, track, side })
								}
								onElementMouseDown={({ event, element }) =>
									onElementMouseDown({ event, element, track })
								}
								onElementClick={({ event, element }) =>
									onElementClick({ event, element, track })
								}
								dragView={dragView}
								isDropTarget={element.id === targetElementId}
							/>
						);
					})
				)}
				
				{/* Render transitions */}
				{trackTransitions.map(transition => {
					const clipA = track.elements.find(e => e.id === transition.clipAId);
					if (!clipA) return null; // Fallback if clip A missing

					const transitionStartTime = clipA.startTime + clipA.duration - (transition.durationMs / 1000) / 2;
					const left = timelineTimeToSnappedPixels({ time: transitionStartTime, zoomLevel });
					const width = (transition.durationMs / 1000) * timelinePixelsPerSecond;

					return (
						<div
							key={transition.id}
							className="absolute top-0 bottom-0 bg-primary/80 border border-primary z-20 flex items-center justify-center rounded-sm overflow-hidden pointer-events-auto"
							style={{
								left: `${left}px`,
								width: `${width}px`,
							}}
							title={`${transition.type} transition`}
						>
							<div className="text-[10px] text-white font-bold tracking-widest truncate px-1 drop-shadow-md capitalize">
								{transition.type}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
