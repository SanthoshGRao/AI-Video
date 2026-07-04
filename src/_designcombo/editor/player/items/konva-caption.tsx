import React, { useEffect, useState, useMemo } from "react";
import { Stage, Layer, Text, Group, Rect } from "react-konva";
import { useCurrentFrame } from "remotion";
import type { ICaption } from "@designcombo/types";

interface KonvaCaptionProps {
	id: string;
	details: ICaption["details"];
	width: number;
	height: number;
	fps: number;
	frame: number;
	offsetFrom: number;
	scaleFactor: number;
	activeWords: any[];
}

export default function KonvaCaption({
	id,
	details,
	width,
	height,
	fps,
	frame,
	offsetFrom,
	scaleFactor,
	activeWords,
}: KonvaCaptionProps) {
	const currentFrame = useCurrentFrame();
	const [fontLoaded, setFontLoaded] = useState(false);

	const fontFamily = details.fontFamily || "Inter";
	const fontSize = (details.fontSize || 40) * scaleFactor;
	const fill = details.color || "#ffffff";
	const activeFillColor = details.activeColor || "#FFD700";
	
	const strokeEnabled = details.stroke?.enabled || false;
	const strokeColor = details.stroke?.color || "#000000";
	const strokeWidth = details.stroke?.width || 0;

	useEffect(() => {
		document.fonts.load(`${fontSize}px ${fontFamily}`).then(() => {
			setFontLoaded(true);
		});
	}, [fontFamily, fontSize]);

	// Extremely simplified layout engine for Konva words
	// In production, we'd need a real text layout engine here
	const wordNodes = useMemo(() => {
		if (!fontLoaded) return [];

		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) return [];
		
		context.font = `${details.fontWeight || "bold"} ${fontSize}px ${fontFamily}`;

		let currentX = 0;
		let currentY = 0;
		const lineHeight = fontSize * 1.2;
		const maxWidth = width * 0.9;
		const gap = fontSize * 0.25;

		const nodes: any[] = [];

		activeWords.forEach((wordObj, i) => {
			const text = wordObj.text;
			const metrics = context.measureText(text);
			const wordWidth = metrics.width;

			if (currentX + wordWidth > maxWidth) {
				currentX = 0;
				currentY += lineHeight;
			}

			// Determine if word is currently spoken
			const wordStartFrame = (wordObj.start + offsetFrom) * (fps / 1000);
			const wordEndFrame = (wordObj.end + offsetFrom) * (fps / 1000);
			const isActive = frame >= wordStartFrame && frame <= wordEndFrame;
			const isAppeared = frame >= wordStartFrame;

			nodes.push({
				id: `word-${i}`,
				text,
				x: currentX,
				y: currentY,
				width: wordWidth,
				isActive,
				isAppeared
			});

			currentX += wordWidth + gap;
		});

		// Center the text block
		const totalHeight = currentY + lineHeight;
		const startY = (height - totalHeight) / 2;

		return nodes.map(node => ({
			...node,
			y: node.y + startY,
			// Simplified centering (would need full line-by-line width calculation for true center)
			x: node.x + (width - currentX) / 2 
		}));
	}, [fontLoaded, activeWords, fontSize, fontFamily, width, height, frame, offsetFrom, fps, details.fontWeight]);

	if (!fontLoaded && fontFamily !== "Inter") {
		return null;
	}

	return (
		<Stage width={width} height={height} style={{ width: "100%", height: "100%" }}>
			<Layer>
				{wordNodes.map((node) => (
					<Group key={node.id} x={node.x} y={node.y}>
						<Text
							text={node.text}
							fontSize={fontSize}
							fontFamily={fontFamily}
							fontStyle={details.fontWeight || "bold"}
							fill={node.isActive ? activeFillColor : fill}
							stroke={strokeEnabled ? strokeColor : undefined}
							strokeWidth={strokeEnabled ? strokeWidth : 0}
							shadowColor="rgba(0,0,0,0.5)"
							shadowBlur={4}
							shadowOffsetX={2}
							shadowOffsetY={2}
							// Add basic pop animation if active
							scaleX={node.isActive ? 1.1 : 1}
							scaleY={node.isActive ? 1.1 : 1}
						/>
					</Group>
				))}
			</Layer>
		</Stage>
	);
}
