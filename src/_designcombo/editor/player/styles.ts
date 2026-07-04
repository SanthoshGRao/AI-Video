import { IImage, IText, ITrackItem } from "@designcombo/types";

export const calculateCropStyles = (
  details: IImage["details"],
  crop: IImage["details"]["crop"]
) => ({
  width: details.width || "100%",
  height: details.height || "auto",
  top: -crop.y || 0,
  left: -crop.x || 0,
  position: "absolute",
  borderRadius: `${Math.min(crop.width, crop.height) * ((details.borderRadius || 0) / 100)}px`
});

export const calculateMediaStyles = (
  details: ITrackItem["details"],
  crop: ITrackItem["details"]["crop"]
) => {
  return {
    pointerEvents: "none",
    boxShadow: [
      `0 0 0 ${details.borderWidth}px ${details.borderColor}`,
      details.boxShadow
        ? `${details.boxShadow.x}px ${details.boxShadow.y}px ${details.boxShadow.blur}px ${details.boxShadow.color}`
        : ""
    ]
      .filter(Boolean)
      .join(", "),
    ...calculateCropStyles(details, crop),
    overflow: "hidden"
  } as React.CSSProperties;
};

export const calculateTextStyles = (
  details: IText["details"]
): React.CSSProperties => ({
  position: "relative",
  textDecoration: details.textDecoration || "none",
  WebkitTextStroke: `${details.borderWidth}px ${details.borderColor}`, // Outline/stroke color and thickness
  paintOrder: "stroke fill", // Order of painting
  textShadow: details.boxShadow
    ? `${details.boxShadow.x}px ${details.boxShadow.y}px ${details.boxShadow.blur}px ${details.boxShadow.color}`
    : "",
  fontFamily: details.fontFamily || "Arial",
  fontWeight: details.fontWeight || "normal",
  fontStyle: details.fontStyle || "normal",
  lineHeight: details.lineHeight || "1.4",
  letterSpacing: details.letterSpacing || "normal",
  wordSpacing: details.wordSpacing || "normal",
  wordWrap: "break-word",
  overflowWrap: "break-word",
  wordBreak: "break-word",
  whiteSpace: "normal",
  textTransform: details.textTransform || "none",
  fontSize: details.fontSize || "16px",
  textAlign: details.textAlign || "left",
  color: details.color || "#000000",
  backgroundColor: details.backgroundColor || "transparent",
  borderRadius: `${Math.min(details.width, details.height) * ((details.borderRadius || 0) / 100)}px`
});

export const calculateContainerStyles = (
  details: ITrackItem["details"],
  crop: ITrackItem["details"]["crop"] = {},
  overrides: React.CSSProperties = {},
  type?: string
): React.CSSProperties => {
  const hidden = details.visibility === "hidden";
  return {
    pointerEvents: hidden ? "none" : "auto",
    display: hidden ? "none" : undefined,
    top: details.top || 0,
    left: details.left || 0,
    width: crop.width || details.width || "100%",
    height:
      type === "text" || type === "caption"
        ? "max-content"
        : crop.height || details.height || "max-content",
    transform: details.transform || "none",
    opacity: details.opacity !== undefined ? details.opacity / 100 : 1,
    transformOrigin: details.transformOrigin || "center center",
    filter: `brightness(${details.brightness}%) blur(${details.blur}px)`,
    rotate: details.rotate || "0deg",
    ...overrides // Merge overrides into the calculated styles
  };
};
