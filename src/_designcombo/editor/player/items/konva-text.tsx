import { useEffect, useState } from "react";
import { Stage, Layer, Text } from "react-konva";
import type { IText } from "@designcombo/types";

type KonvaTextDetails = IText["details"] & {
	stroke?: { enabled?: boolean; color?: string; width?: number };
	shadow?: { enabled?: boolean; color?: string; blur?: number; offsetX?: number; offsetY?: number };
};

function konvaFontStyle(fontStyle: unknown, fontWeight: unknown): string {
	const weight = Number(fontWeight) || 400;
	const weightName = weight >= 900 ? "900" : weight >= 800 ? "800" : weight >= 700 ? "bold" : weight >= 600 ? "600" : "normal";
	return `${fontStyle === "italic" ? "italic " : ""}${weightName}`.trim();
}

interface KonvaTextProps {
	id: string;
	details: KonvaTextDetails;
	width: number;
	height: number;
	editable: boolean;
	fps: number;
	durationInFrames: number;
}

export default function KonvaText({
	details,
	width,
	height,
}: KonvaTextProps) {
	const [fontLoaded, setFontLoaded] = useState(false);

	// Basic Konva text properties mapped from DOM styles
	const fontFamily = details.fontFamily || "Inter";
	const fontSize = Number(details.fontSize) || 40;
	const fill = details.color || "#ffffff";
	const text = details.text || "";
	const stageWidth = Number(width) || 0;
	const stageHeight = Number(height) || 0;
	
	// Stroke mapping
	const strokeEnabled = details.stroke?.enabled || false;
	const strokeColor = details.stroke?.color || "#000000";
	const strokeWidth = details.stroke?.width || 0;

	// Shadow mapping
	const shadowEnabled = details.shadow?.enabled || false;
	const shadowColor = details.shadow?.color || "rgba(0,0,0,0.5)";
	const shadowBlur = details.shadow?.blur || 0;
	const shadowOffsetX = details.shadow?.offsetX || 0;
	const shadowOffsetY = details.shadow?.offsetY || 0;

	const letterSpacing = Number(details.letterSpacing) || 0;
	const lineHeight = Number(details.lineHeight) || 1.2;
	const fontStyle = konvaFontStyle(details.fontStyle, details.fontWeight);

	useEffect(() => {
		// Ensure font is fully loaded in DOM before Konva tries to measure/draw it on canvas
		document.fonts.load(`${fontSize}px ${fontFamily}`).then(() => {
			setFontLoaded(true);
		});
	}, [fontFamily, fontSize]);

	if (!fontLoaded && fontFamily !== "Inter") {
		return null; // Avoid canvas flash of unstyled text
	}

	return (
		<Stage width={stageWidth} height={stageHeight} style={{ width: "100%", height: "100%" }}>
			<Layer>
				<Text
					text={text}
					fontSize={fontSize}
					fontFamily={fontFamily}
					fill={fill}
					width={stageWidth}
					height={stageHeight}
					align={details.textAlign || "center"}
					verticalAlign="middle"
					stroke={strokeEnabled ? strokeColor : undefined}
					strokeWidth={strokeEnabled ? strokeWidth : 0}
					shadowColor={shadowEnabled ? shadowColor : undefined}
					shadowBlur={shadowEnabled ? shadowBlur : 0}
					shadowOffsetX={shadowEnabled ? shadowOffsetX : 0}
					shadowOffsetY={shadowEnabled ? shadowOffsetY : 0}
					letterSpacing={letterSpacing}
					lineHeight={lineHeight}
					fontStyle={fontStyle}
					textDecoration={details.textDecoration || ""}
				/>
			</Layer>
		</Stage>
	);
}
