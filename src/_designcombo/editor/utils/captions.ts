import { generateId } from "@designcombo/timeline";
import { ICaption } from "@designcombo/types";

interface Word {
  start: number;
  end: number;
  word: string;
}

interface ICaptionLine {
  text: string;
  words: Word[];
  width: number;
  start: number;
  end: number;
}

export const generateCaption = (
  captionLine: ICaptionLine,
  fontInfo: FontInfo,
  options: Options,
  sourceUrl: string
): ICaption => {
  const caption = {
    id: generateId(),
    type: "caption",
    name: "Caption",
    display: {
      from: options.displayFrom + captionLine.start * 1000,
      to: options.displayFrom + captionLine.end * 1000
    },
    metadata: {
      sourceUrl,
      parentId: options.parentId
    },
    details: {
      // top: 100,
      appearedColor: "#FFFFFF",
      activeColor: "#50FF12",
      activeFillColor: "#7E12FF",
      color: "#DADADA",
      backgroundColor: "transparent",
      borderColor: "#000000",
      borderWidth: 5,
      text: captionLine.text,
      fontSize: fontInfo.fontSize,
      width: options.containerWidth,
      fontFamily: fontInfo.fontFamily,
      fontUrl: fontInfo.fontUrl,
      textAlign: "center",
      linesPerCaption: options.linesPerCaption,
      words: captionLine.words.map((w) => ({
        ...w,
        start: w.start * 1000,
        end: w.end * 1000
      }))
    } as unknown
  };
  return caption as ICaption;
};

interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

interface CaptionsInput {
  sourceUrl: string;
  results: {
    main: {
      words: Word[];
    };
  };
}

function createCaptionLines(
  input: CaptionsInput,
  fontInfo: FontInfo,
  options: Options
): ICaptionLine[] {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return [];
  context.font = `${fontInfo.fontSize}px ${fontInfo.fontFamily}`;

  const words: Word[] = input.results.main.words;
  if (words.length === 0) return [];

  let totalWidth = 0;
  words.forEach((wordObj) => {
    totalWidth += context.measureText(wordObj.word).width;
  });

  return [
    {
      text: words.map(w => w.word).join(" "),
      words: words,
      width: totalWidth,
      start: words[0].start,
      end: words[words.length - 1].end
    }
  ];
}
interface FontInfo {
  fontFamily: string;
  fontUrl: string;
  fontSize: number;
}

interface Options {
  containerWidth: number;
  linesPerCaption: number;
  parentId: string;
  displayFrom: number;
}

export function generateCaptions(
  input: CaptionsInput,
  fontInfo: FontInfo,
  options: Options
): ICaption[] {
  const captionLines = createCaptionLines(input, fontInfo, options);

  const captions = captionLines.map((line) =>
    generateCaption(line, fontInfo, options, input.sourceUrl)
  );

  return captions;
}
