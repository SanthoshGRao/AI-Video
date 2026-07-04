import { ICaption } from "@designcombo/types";
import { BaseSequence, SequenceItemOptions } from "../base-sequence";
import { BoxAnim, ContentAnim } from "@designcombo/animations";
import { calculateContainerStyles, calculateTextStyles } from "../styles";
import { getAnimations } from "../../utils/get-animations";
import { calculateFrames } from "../../utils/frames";
import { CaptionWord } from "./caption-word";
import KonvaCaption from "./konva-caption";
import React from "react";
import {
  TranslateAnimationCaption,
  TranslateOnceAnimation,
  ScaleAnimationCaption,
  ScaleAnimationBetween,
  ScalePulseAnimationCaption,
  ScaleAnimationLoop,
  OpacityAnimationCaption,
  ANIMATION_CONFIGS,
  captionRotationCache,
  rotationOptions,
  AnimationConfig
} from "./caption-animations";

export default function Caption({
  item,
  options
}: {
  item: ICaption;
  options: SequenceItemOptions;
}) {
  const { fps, frame } = options;
  const { details, display, animations } = item as ICaption;
  const { animationIn, animationOut, animationTimed } = getAnimations(
    animations!,
    item,
    frame,
    fps
  );
  const { from, durationInFrames } = calculateFrames(item.display, fps);
  const currentFrame = (frame || 0) - (item.display.from * fps) / 1000;
  const [firstWord] = details.words;
  const offsetFrom = display.from - firstWord.start;

  // Calculate scale factor and update details
  const updatedDetails = calculateUpdatedDetails(details);
  const scaleFactor = updatedDetails.scaleFactor;

  // Calculate animation transforms
  const { transformStyles, globalOpacity, extraStyles } =
    calculateAnimationTransforms(updatedDetails, frame || 0, from, fps, item);

  const { height, width, ...filteredStyles } =
    calculateContainerStyles(updatedDetails);

  const children = (
    <BoxAnim
      style={{
        ...filteredStyles,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        maxHeight: "max-content",
        height: "100%",
        width: width || "100%"
      }}
      animationIn={animationIn}
      animationOut={animationOut}
      frame={currentFrame}
      durationInFrames={durationInFrames}
    >
      <ContentAnim
        animationNameIn={animationIn}
        animationNameOut={animationOut}
        animationNameTimed={animationTimed}
        extraStyles={extraStyles}
        from={from}
        display={item.display}
        durationInFrames={durationInFrames}
        frame={currentFrame}
      >
        <KonvaCaption
          id={item.id}
          details={updatedDetails}
          width={width || 800}
          height={height || 600}
          fps={fps}
          frame={frame || 0}
          offsetFrom={offsetFrom}
          scaleFactor={scaleFactor}
          activeWords={item.details.words}
        />
      </ContentAnim>
    </BoxAnim>
  );

  return BaseSequence({ item, options, children });
}

// Helper functions
function calculateUpdatedDetails(details: any) {
  const baseFontSize = 20;
  const fontSize = details.fontSize || baseFontSize;
  const scaleFactor = fontSize / baseFontSize;

  let strokeWidth = details.WebkitTextStrokeWidth ?? "0px";
  if (typeof strokeWidth === "string" && strokeWidth.endsWith("px")) {
    strokeWidth = parseFloat(strokeWidth) * scaleFactor + "px";
  }

  let borderWidth = details.borderWidth ?? 0;
  if (typeof borderWidth === "number") {
    borderWidth = borderWidth * scaleFactor;
  }

  const boxShadow = details.boxShadow || {
    x: 0,
    y: 0,
    blur: 0,
    color: "#000000"
  };

  const scaledBoxShadow = {
    ...boxShadow,
    x: boxShadow.x * scaleFactor,
    y: boxShadow.y * scaleFactor,
    blur: boxShadow.blur * scaleFactor
  };

  return {
    ...details,
    WebkitTextStrokeWidth: strokeWidth,
    boxShadow: scaledBoxShadow,
    borderWidth,
    scaleFactor
  };
}

function calculateAnimationTransforms(
  updatedDetails: any,
  frame: number,
  from: number,
  fps: number,
  item: ICaption
) {
  const relativeFrame = Math.max(frame - from, 0);
  let transformValues: {
    translateX?: number;
    translateY?: number;
    scale?: number;
    opacity?: number;
    rotate?: number;
  } = {};

  let globalOpacity: number | undefined;
  let extraStyles: React.CSSProperties = {};

  if (updatedDetails?.animation) {
    const config = ANIMATION_CONFIGS[updatedDetails.animation] || {};
    const userConfig = parseUserAnimationConfig(updatedDetails.animation);

    // Apply scale animation
    if (config.scale || userConfig.scale) {
      const scaleConfig = userConfig.scale ?? config.scale;
      if (scaleConfig) {
        transformValues.scale = ScaleAnimationCaption(
          relativeFrame,
          item.display.to,
          fps,
          scaleConfig.value,
          scaleConfig.mode
        );
      }
    }

    // Apply translate animation
    if (config.translate || userConfig.translate) {
      const translateConfig = userConfig.translate ?? config.translate;
      const translation = TranslateAnimationCaption(
        relativeFrame,
        translateConfig
      );
      transformValues = { ...transformValues, ...translation };
    }

    // Apply opacity animation
    if (config.opacity || userConfig.opacity) {
      const opacityConfig = userConfig.opacity ?? config.opacity;
      transformValues.opacity = OpacityAnimationCaption(
        relativeFrame,
        item.display.to,
        fps,
        opacityConfig
      );
    }

    // Apply scale pulse animation
    if (config.scalePulse || userConfig.scalePulse) {
      transformValues.scale = ScalePulseAnimationCaption(
        relativeFrame,
        item.display.to,
        fps
      );
    }

    // Apply scale loop animation
    if (config.scaleAnimationLoop || userConfig.scaleAnimationLoop) {
      transformValues.scale = ScaleAnimationLoop(relativeFrame);
    }

    // Apply scale between animation
    if (config.scaleAnimationBetween || userConfig.scaleAnimationBetween) {
      transformValues.scale = ScaleAnimationBetween(
        relativeFrame,
        item.display.to,
        fps,
        50,
        0.8,
        1
      );
    }

    // Apply translate once animation
    if (config.translateOnceAnimation || userConfig.translateOnceAnimation) {
      const translateOnceConfig =
        userConfig.translateOnceAnimation ?? config.translateOnceAnimation;
      if (translateOnceConfig) {
        const { duration = 30, orientation = "horizontal" } =
          translateOnceConfig;
        transformValues = {
          ...transformValues,
          ...TranslateOnceAnimation(relativeFrame, duration, orientation)
        };
      }
    }

    // Apply rotation animations
    if (config.rotateRandom || userConfig.rotateRandom) {
      const captionId = item.id;
      if (!captionRotationCache.has(captionId)) {
        const randomRotation =
          rotationOptions[Math.floor(Math.random() * rotationOptions.length)];
        captionRotationCache.set(captionId, randomRotation);
      }
      transformValues.rotate = captionRotationCache.get(captionId)!;
    }

    if (
      config.rotateFixed !== undefined ||
      userConfig.rotateFixed !== undefined
    ) {
      transformValues.rotate = userConfig.rotateFixed ?? config.rotateFixed;
    }

    // Apply global opacity
    if (
      config.globalOpacity !== undefined ||
      userConfig.globalOpacity !== undefined
    ) {
      const globalOpacityConfig =
        userConfig.globalOpacity ?? config.globalOpacity;
      globalOpacity = OpacityAnimationCaption(
        relativeFrame,
        item.display.to,
        fps,
        globalOpacityConfig
      );
    }

    // Apply extra styles
    if (config.extraStyles || userConfig.extraStyles) {
      extraStyles = {
        ...extraStyles,
        ...(userConfig.extraStyles ?? config.extraStyles)
      };
    }
  }

  // Build transform styles
  const transformParts: string[] = [];

  if (
    transformValues.translateX !== undefined ||
    transformValues.translateY !== undefined
  ) {
    const x = transformValues.translateX ?? 0;
    const y = transformValues.translateY ?? 0;
    transformParts.push(`translate(${x}px, ${y}px)`);
  }

  if (transformValues.scale !== undefined) {
    transformParts.push(`scale(${transformValues.scale})`);
  }

  if (transformValues.rotate !== undefined) {
    transformParts.push(`rotate(${transformValues.rotate}deg)`);
  }

  const transformStyles = {
    ...(transformParts.length > 0 && { transform: transformParts.join(" ") }),
    ...(transformValues.opacity !== undefined && {
      opacity: transformValues.opacity
    })
  };

  return { transformStyles, globalOpacity, extraStyles };
}

function parseUserAnimationConfig(animationString: string): AnimationConfig {
  const userConfig: AnimationConfig = {};
  const animationsUser = animationString.split("/");

  animationsUser.forEach((anim) => {
    // Scale
    if (
      anim.includes("scale") &&
      !anim.startsWith("scalePulse") &&
      !anim.startsWith("scaleAnimationLoop") &&
      !anim.startsWith("scale-up-0") &&
      !anim.startsWith("scale-up-08") &&
      !anim.startsWith("scale-up-12")
    ) {
      userConfig.scale = { value: 50 };
    }

    // Translate
    if (anim.startsWith("translate-")) {
      const option = anim.split("-")[1];
      if (
        option === "horizontal" ||
        option === "vertical" ||
        option === "bilateral"
      ) {
        userConfig.translate = option;
      }
    }

    // Opacity
    if (anim.includes("opacity")) {
      userConfig.opacity = 2;
    }

    // Scale Pulse
    if (anim.includes("scale-pulse")) {
      userConfig.scalePulse = true;
    }

    // Scale Animation Loop
    if (anim.includes("scale-animation-loop")) {
      userConfig.scaleAnimationLoop = true;
    }

    // Rotate Random
    if (anim.includes("rotate-random")) {
      userConfig.rotateRandom = true;
    }

    // Rotate Fixed
    if (anim.includes("rotate-fixed")) {
      userConfig.rotateFixed = 10;
    }
  });

  return userConfig;
}

function renderWords(
  item: ICaption,
  updatedDetails: any,
  scaleFactor: number,
  offsetFrom: number,
  fps: number,
  currentFrame: number,
  globalOpacity?: number,
  absoluteFrame?: number
) {
  if (
    updatedDetails?.showObject === "line" &&
    updatedDetails?.linesPerCaption
  ) {
    return renderLineBasedWords(
      item,
      updatedDetails,
      scaleFactor,
      offsetFrom,
      fps,
      currentFrame,
      globalOpacity,
      absoluteFrame
    );
  } else if (updatedDetails?.animation === "customAnimation1") {
    return renderCustomAnimation1Words(
      item,
      updatedDetails,
      scaleFactor,
      offsetFrom,
      globalOpacity
    );
  } else {
    return renderStandardWords(
      item,
      updatedDetails,
      scaleFactor,
      offsetFrom,
      currentFrame,
      fps,
      globalOpacity,
      absoluteFrame || 0
    );
  }
}

function renderLineBasedWords(
  item: ICaption,
  updatedDetails: any,
  scaleFactor: number,
  offsetFrom: number,
  fps: number,
  currentFrame: number,
  globalOpacity?: number,
  absoluteFrame?: number
) {
  const wordsPerLine = Math.ceil(
    item.details.words.length / updatedDetails.linesPerCaption
  );
  const lines: any[][] = [];

  for (let i = 0; i < updatedDetails.linesPerCaption; i++) {
    const startIndex = i * wordsPerLine;
    const endIndex = Math.min(
      startIndex + wordsPerLine,
      item.details.words.length
    );
    lines.push(item.details.words.slice(startIndex, endIndex));
  }

  const lineDuration =
    (item.display.to - item.display.from) / updatedDetails.linesPerCaption;
  const currentLine = Math.min(
    Math.floor(currentFrame / ((lineDuration * fps) / 1000)),
    updatedDetails.linesPerCaption - 1
  );

  return lines.map((lineWords, lineIndex) => (
    <div
      key={lineIndex}
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: lineIndex < lines.length - 1 ? "12px" : "0",
        maxWidth: "100%",
        wordWrap: "break-word",
        wordBreak: "break-word",
        overflowWrap: "break-word"
      }}
    >
      {lineWords.map((word: any, wordIndex: number) => (
        <React.Fragment key={`${lineIndex}-${wordIndex}`}>
          <CaptionWord
            {...createCaptionWordProps(
              word,
              updatedDetails,
              scaleFactor,
              offsetFrom,
              updatedDetails.animation || "",
              globalOpacity,
              undefined,
              lineIndex,
              currentLine,
              absoluteFrame ?? currentFrame
            )}
          />
          {wordIndex < lineWords.length - 1 && " "}
        </React.Fragment>
      ))}
    </div>
  ));
}

function renderCustomAnimation1Words(
  item: ICaption,
  updatedDetails: any,
  scaleFactor: number,
  offsetFrom: number,
  globalOpacity?: number
) {
  const nonKeywordWords = item.details.words.filter(
    (word: any) => !word.is_keyword
  );
  const keywordWords = item.details.words.filter(
    (word: any) => word.is_keyword
  );
  const groupedWords: any[] = [];

  if (nonKeywordWords.length > 0) {
    const firstNonKeyword = nonKeywordWords[0];
    const lastNonKeyword = nonKeywordWords[nonKeywordWords.length - 1];
    const firstKeywordWord = keywordWords[0];
    const groupEndTime = firstKeywordWord
      ? firstKeywordWord.start
      : lastNonKeyword.end;

    const groupWord = {
      word: nonKeywordWords.map((w) => w.word).join(" "),
      start: firstNonKeyword.start,
      end: groupEndTime,
      is_keyword: false
    };
    groupedWords.push(groupWord);
  }

  keywordWords.forEach((word) => {
    groupedWords.push(word);
  });

  return groupedWords.map((word: any, index: number) => (
    <React.Fragment key={index}>
      <CaptionWord
        {...createCaptionWordProps(
          word,
          updatedDetails,
          scaleFactor,
          offsetFrom,
          updatedDetails.animation || "",
          globalOpacity,
          "word",
          undefined,
          undefined,
          undefined
        )}
      />
      {index < groupedWords.length - 1 && " "}
    </React.Fragment>
  ));
}

function renderStandardWords(
  item: ICaption,
  updatedDetails: any,
  scaleFactor: number,
  offsetFrom: number,
  currentFrame: number,
  fps: number,
  globalOpacity?: number,
  absoluteFrame?: number
) {
  const frameToUse = absoluteFrame ?? currentFrame;
  // We group words into sentences so we only render the active sentence.
  const sentences: any[][] = [];
  let currentSentence: any[] = [];
  
  item.details.words.forEach((word: any, index: number) => {
    currentSentence.push(word);
    if (
      word.word.match(/[.!?]$/) || 
      currentSentence.length >= 7 ||
      index === item.details.words.length - 1
    ) {
      sentences.push(currentSentence);
      currentSentence = [];
    }
  });

  // Find the active sentence based on timestamps
  let activeSentenceIndex = 0;
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (sentence.length === 0) continue;
    const startFrame = ((sentence[0].start + offsetFrom) / 1000) * fps;
    const endFrame = ((sentence[sentence.length - 1].end + offsetFrom) / 1000) * fps;
    
    // Check if the absolute frame is within this sentence, or if this is the closest past sentence
    if (frameToUse >= startFrame && frameToUse <= endFrame) {
      activeSentenceIndex = i;
      break;
    } else if (frameToUse > endFrame) {
      activeSentenceIndex = i; // Keep the last passed sentence visible until the next one starts
    }
  }

  const activeWords = sentences[activeSentenceIndex] || [];

  return activeWords.map((word: any, index: number) => (
    <React.Fragment key={`${activeSentenceIndex}-${index}`}>
      <CaptionWord
        {...createCaptionWordProps(
          word,
          updatedDetails,
          scaleFactor,
          offsetFrom,
          updatedDetails.animation || "",
          globalOpacity,
          undefined,
          undefined,
          undefined,
          frameToUse
        )}
      />
      {index < activeWords.length - 1 && " "}
    </React.Fragment>
  ));
}

// Helper function to create common CaptionWord props
const createCaptionWordProps = (
  word: any,
  updatedDetails: any,
  scaleFactor: number,
  offsetFrom: number,
  animation: string,
  globalOpacity?: number,
  showObject?: string,
  lineIndex?: number,
  currentLine?: number,
  currentFrameOverride?: number
) => ({
  word,
  offsetFrom,
  activeColor: updatedDetails.activeColor || updatedDetails.color,
  activeFillColor: updatedDetails.activeFillColor || "transparent",
  appearedColor: updatedDetails.appearedColor || updatedDetails.color,
  color: updatedDetails.color,
  animation,
  globalOpacity,
  isKeywordColor: updatedDetails?.isKeywordColor || "transparent",
  preservedColorKeyWord: updatedDetails?.preservedColorKeyWord || false,
  scaleFactor,
  animationNoneCaption: false,
  showObject: showObject || updatedDetails?.showObject || "page",
  lineIndex,
  currentLine,
  currentFrameOverride
});
