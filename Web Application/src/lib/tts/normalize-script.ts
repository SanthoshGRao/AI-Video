import { PRONUNCIATION_DICT } from "./pronunciation-dictionary";

const KANNADA_1_TO_99: Record<number, string> = {
  1: "ಒಂದು", 2: "ಎರಡು", 3: "ಮೂರು", 4: "ನಾಲ್ಕು", 5: "ಐದು", 6: "ಆರು", 7: "ಏಳು", 8: "ಎಂಟು", 9: "ಒಂಬತ್ತು",
  10: "ಹತ್ತು", 11: "ಹನ್ನೊಂದು", 12: "ಹನ್ನೆರಡು", 13: "ಹದಿಮೂರು", 14: "ಹದಿನಾಲ್ಕು", 15: "ಹದಿನೈದು", 16: "ಹದಿನಾರು", 17: "ಹದಿನೇಳು", 18: "ಹದಿನೆಂಟು", 19: "ಹತ್ತೊಂಬತ್ತು",
  20: "ಇಪ್ಪತ್ತು", 21: "ಇಪ್ಪತ್ತೊಂದು", 22: "ಇಪ್ಪತ್ತೆರಡು", 23: "ಇಪ್ಪತ್ತಮೂರು", 24: "ಇಪ್ಪತ್ತನಾಲ್ಕು", 25: "ಇಪ್ಪತ್ತೈದು", 26: "ಇಪ್ಪತ್ತಾರು", 27: "ಇಪ್ಪತ್ತೇಳು", 28: "ಇಪ್ಪತ್ತೆಂಟು", 29: "ಇಪ್ಪತ್ತೊಂಬತ್ತು",
  30: "ಮೂವತ್ತು", 31: "ಮೂವತ್ತೊಂದು", 32: "ಮೂವತ್ತೆರಡು", 33: "ಮೂವತ್ತಮೂರು", 34: "ಮೂವತ್ತನಾಲ್ಕು", 35: "ಮೂವತ್ತೈದು", 36: "ಮೂವತ್ತಾರು", 37: "ಮೂವತ್ತೇಳು", 38: "ಮೂವತ್ತೆಂಟು", 39: "ಮೂವತ್ತೊಂಬತ್ತು",
  40: "ನಲವತ್ತು", 41: "ನಲವತ್ತೊಂದು", 42: "ನಲವತ್ತೆರಡು", 43: "ನಲವತ್ತಮೂರು", 44: "ನಲವತ್ತನಾಲ್ಕು", 45: "ನಲವತ್ತೈದು", 46: "ನಲವತ್ತಾರು", 47: "ನಲವತ್ತೇಳು", 48: "ನಲವತ್ತೆಂಟು", 49: "ನಲವತ್ತೊಂಬತ್ತು",
  50: "ಐವತ್ತು", 51: "ಐವತ್ತೊಂದು", 52: "ಐವತ್ತೆರಡು", 53: "ಐವತ್ತಮೂರು", 54: "ಐವತ್ತನಾಲ್ಕು", 55: "ಐವತ್ತೈದು", 56: "ಐವತ್ತಾರು", 57: "ಐವತ್ತೇಳು", 58: "ಐವತ್ತೆಂಟು", 59: "ಐವತ್ತೊಂಬತ್ತು",
  60: "ಅರವತ್ತು", 61: "ಅರವತ್ತೊಂದು", 62: "ಅರವತ್ತೆರಡು", 63: "ಅರವತ್ತಮೂರು", 64: "ಅರವತ್ತನಾಲ್ಕು", 65: "ಅರವತ್ತೈದು", 66: "ಅರವತ್ತಾರು", 67: "ಅರವತ್ತೇಳು", 68: "ಅರವತ್ತೆಂಟು", 69: "ಅರವತ್ತೊಂಬತ್ತು",
  70: "ಎಪ್ಪತ್ತು", 71: "ಎಪ್ಪತ್ತೊಂದು", 72: "ಎಪ್ಪತ್ತೆರಡು", 73: "ಎಪ್ಪತ್ತಮೂರು", 74: "ಎಪ್ಪತ್ತನಾಲ್ಕು", 75: "ಎಪ್ಪತ್ತೈದು", 76: "ಎಪ್ಪತ್ತಾರು", 77: "ಎಪ್ಪತ್ತೇಳು", 78: "ಎಪ್ಪತ್ತೆಂಟು", 79: "ಎಪ್ಪತ್ತೊಂಬತ್ತು",
  80: "ಎಂಬತ್ತು", 81: "ಎಂಬತ್ತೊಂದು", 82: "ಎಂಬತ್ತೆರಡು", 83: "ಎಂಬತ್ತಮೂರು", 84: "ಎಂಬತ್ತನಾಲ್ಕು", 85: "ಎಂಬತ್ತೈದು", 86: "ಎಂಬತ್ತಾರು", 87: "ಎಂಬತ್ತೇಳು", 88: "ಎಂಬತ್ತೆಂಟು", 89: "ಎಂಬತ್ತೊಂಬತ್ತು",
  90: "ತೊಂಬತ್ತು", 91: "ತೊಂಬತ್ತೊಂದು", 92: "ತೊಂಬತ್ತೆರಡು", 93: "ತೊಂಬತ್ತಮೂರು", 94: "ತೊಂಬತ್ತನಾಲ್ಕು", 95: "ತೊಂಬತ್ತೈದು", 96: "ತೊಂಬತ್ತಾರು", 97: "ತೊಂಬತ್ತೇಳು", 98: "ತೊಂಬತ್ತೆಂಟು", 99: "ತೊಂಬತ್ತೊಂಬತ್ತು"
};

export function convertNumberToKannada(num: number): string {
  if (num < 0) return "ಮೈನಸ್ " + convertNumberToKannada(Math.abs(num));
  if (num === 0) return "ಸೊನ್ನೆ";
  if (num <= 99) return KANNADA_1_TO_99[num];
  
  if (num <= 999) {
    const h = Math.floor(num / 100);
    const rem = num % 100;
    const hStr = h === 1 ? "ನೂರ" : (convertNumberToKannada(h).replace(/ು$/, "") + "ನೂರ");
    if (rem === 0) return h === 1 ? "ನೂರು" : (convertNumberToKannada(h).replace(/ು$/, "") + "ನೂರು");
    return hStr + " " + convertNumberToKannada(rem);
  }
  if (num <= 99999) {
    const t = Math.floor(num / 1000);
    const rem = num % 1000;
    const tStr = convertNumberToKannada(t) + " ಸಾವಿರ";
    if (rem === 0) return tStr;
    return tStr + " " + convertNumberToKannada(rem);
  }
  if (num <= 9999999) {
    const l = Math.floor(num / 100000);
    const rem = num % 100000;
    const lStr = convertNumberToKannada(l) + " ಲಕ್ಷ";
    if (rem === 0) return lStr;
    return lStr + " " + convertNumberToKannada(rem);
  }
  const c = Math.floor(num / 10000000);
  const rem = num % 10000000;
  const cStr = convertNumberToKannada(c) + " ಕೋಟಿ";
  if (rem === 0) return cStr;
  return cStr + " " + convertNumberToKannada(rem);
}

export function normalizeKannadaSpeech(text: string): string {
  let normalized = text;

  // 1. Convert numbers
  normalized = normalized.replace(/\b\d+(,\d+)*(\.\d+)?\b/g, (match) => {
    const cleanNum = parseFloat(match.replace(/,/g, ""));
    if (isNaN(cleanNum)) return match;
    // We handle only integers cleanly for now
    if (Number.isInteger(cleanNum)) {
      return convertNumberToKannada(cleanNum);
    }
    return match; // fallback for decimals
  });

  // 2. Apply dictionary replacements (case insensitive but sort keys by length descending to match longest first)
  const dictKeys = Object.keys(PRONUNCIATION_DICT).sort((a, b) => b.length - a.length);
  for (const key of dictKeys) {
    const val = PRONUNCIATION_DICT[key];
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    normalized = normalized.replace(regex, val);
  }

  // 3. Pacing & Pauses
  // Replace newlines or bullet points with commas to induce natural pauses
  normalized = normalized.replace(/\n+/g, ", ");
  normalized = normalized.replace(/•/g, ", ");
  normalized = normalized.replace(/- /g, ", ");

  // Optional: Enhance pacing for real estate by ensuring strong pauses after sentences
  normalized = normalized.replace(/\./g, ".");

  return normalized;
}
