import type { SubtitleCue } from "@/lib/subtitles/types";

export type KeyFact = {
  id: string;
  text: string;
  category: string;
  startMs: number;
  endMs: number;
};

/* ------------------------------------------------------------------ */
/*  Pattern-based fact nugget extractors                               */
/*                                                                    */
/*  Each pattern scans subtitle text and pulls out ONLY the short,    */
/*  punchy data nugget — not the whole sentence.                      */
/*                                                                    */
/*  Example: from "escape to your dream farmland just 12 kilometers   */
/*  from Mysore" → extracts "12 KM from Mysore"                      */
/* ------------------------------------------------------------------ */

type FactPattern = {
  category: string;
  regex: RegExp;
  /** Optional formatter to clean up the match for display */
  format?: (match: string) => string;
};

const FACT_PATTERNS: FactPattern[] = [
  // ── ACREAGE / PLOT SIZE ──
  // "1.22 acre land", "2 acres 15 guntas", "5.16 acre coconut farm", "2400 sq ft plot"
  {
    category: "Acreage",
    regex: /\d+(?:\.\d+)?(?:\s*acres?\s*(?:\d+\s*)?(?:guntas?|gunthas?)?|\s*guntas?|\s*gunthas?|\s*cents?|\s*hectares?|\s*sq\.?\s*(?:ft|feet|meters?|yards?))\s*(?:(?:of\s+)?(?:coconut\s+)?(?:farm|farmland|land|plot|site|layout|plantation|property))?/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── PRICE ──
  // "₹35 Lakhs", "Rs 50 Crore per acre", "52 lakhs per acre"
  {
    category: "Price",
    regex: /(?:₹|Rs\.?|INR)\s*[\d,.]+\s*(?:Lakhs?|Lakh|Crores?|Cr)?(?:\s+per\s+(?:acre|guntha|cent|sq\.?\s*ft))?(?:\s*(?:only|onwards|negotiable))?|[\d,.]+\s+(?:Lakhs?|Lakh|Crores?|Cr)(?:\s+per\s+(?:acre|guntha|cent|sq\.?\s*ft))?(?:\s*(?:only|onwards|negotiable))?/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── DISTANCE ──
  // "12 kilometers from Mysore", "25 km from Bangalore", "10 KM from highway"
  {
    category: "Distance",
    regex: /\d+(?:\.\d+)?\s*(?:kilometers?|kilometres?|kms?|km)\s+(?:from|to|away\s+from)\s+[A-Za-z][A-Za-z\s]{1,25}?(?=\s*[,.]|\s+and\s|\s+with\s|\s+near\s|$)/gi,
    format: (m) => m.replace(/kilometers?|kilometres?/gi, "KM").replace(/kms/gi, "KM").replace(/\s+/g, " ").trim(),
  },

  // ── ROAD ACCESS ──
  // "30 ft tar road", "60 feet highway road access", "highway frontage"
  {
    category: "Road Access",
    regex: /\d+\s*(?:ft|feet|foot)\s*(?:wide\s+)?(?:tar\s+)?(?:road|highway)(?:\s+(?:access|frontage))?|\d+\s*(?:ft|feet|foot)\s+road\s+access|(?:tar|asphalt|concrete)\s+road\s*(?:access|frontage)?|highway\s+(?:road\s+)?(?:access|frontage)|main\s+road\s+(?:access|frontage)/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── PLANTATION / TREES ──
  // "280 coconut trees", "42 mango trees", "150 arecanut plants"
  {
    category: "Plantation",
    regex: /\d+\s+(?:coconut|mango|teak|arecanut|sandalwood|sapota|cashew|rubber|silver\s+oak|jack\s*fruit)?\s*(?:trees?|plants?|palms?)/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── BOREWELLS / WATER ──
  // "2 borewells", "1 borewell", "water channel", "canal water"
  {
    category: "Water",
    regex: /\d+\s+bore\s*wells?|\d+\s+wells?|bore\s*well(?:\s+available)?|water\s+channel(?:\s+(?:on\s+land|available))?|canal\s+(?:water|irrigation)|cauvery\s+water/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── ELECTRICITY ──
  // "electricity available", "3 phase power", "power connection"
  {
    category: "Electricity",
    regex: /electricity\s+available|3[\s-]?phase\s+(?:power|electricity|connection)|power\s+connection(?:\s+available)?/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── LEGAL / APPROVALS ──
  // "RTC available", "DTCP approved", "clear title"
  {
    category: "Approvals",
    regex: /(?:DTCP|BDA|BMRDA|KIADB|RERA|RTC|CMDA|DC|BBMP|revenue|panchayat|gram\s+panchayat)\s*(?:approved|available|converted|registered|property|document)?|clear\s+title|title\s+clear|freehold\s+(?:land|property)|converted\s+land|general\s+property/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── LOCATION / NEAR ──
  // "near Mysore", "near Mysore ring road"
  {
    category: "Location",
    regex: /(?:near|on)\s+(?:the\s+)?(?:[A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]+){0,3})(?:\s+(?:ring\s+road|highway|main\s+road|bypass|junction))?/g,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── FOUNDATION / STRUCTURE ──
  // "farmhouse foundation ready", "compound wall", "fencing done"
  {
    category: "Structure",
    regex: /(?:farmhouse|farm\s+house)\s+(?:foundation|structure)\s*(?:ready|done|available)?|compound\s+wall(?:\s+(?:ready|done|available))?|fencing(?:\s+(?:ready|done|available|completed))?|gated\s+(?:community|property)/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── IRRIGATION ──
  {
    category: "Irrigation",
    regex: /drip\s+irrigation(?:\s+(?:available|installed|ready))?|canal\s+irrigation|sprinkler\s+(?:system|irrigation)/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },

  // ── PROPERTY TYPE ──
  // "coconut farm", "farmland", "agricultural land"
  {
    category: "Property Type",
    regex: /coconut\s+farm(?:land)?|mango\s+(?:farm|plantation)|agricultural\s+land|plantation\s+land|farm\s*land|farm\s+house\s+land/gi,
    format: (m) => m.replace(/\s+/g, " ").trim(),
  },
];

/* ------------------------------------------------------------------ */
/*  Title-case helper                                                 */
/* ------------------------------------------------------------------ */
const LOWERCASE_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "is", "are", "was", "were", "be",
  "per", "near", "via",
]);

const UPPERCASE_WORDS = new Set([
  "km", "ft", "rtc", "dtcp", "bda", "bmrda", "kiadb", "rera", "cmda",
  "dc", "nh", "sh", "bbmp", "inr",
]);

function titleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (UPPERCASE_WORDS.has(lower)) return word.toUpperCase();
      if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      if (LOWERCASE_WORDS.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/* ------------------------------------------------------------------ */
/*  Find the subtitle cue timing for a matched phrase                 */
/* ------------------------------------------------------------------ */
function findMatchTiming(
  cues: SubtitleCue[],
  matchText: string,
  matchIndex: number,
  fullText: string
): { startMs: number; endMs: number } | null {
  // Calculate which character position in the full narration text this match is at
  // Then find the cue that contains that position
  let charOffset = 0;

  for (const cue of cues) {
    const cueTextLen = cue.text.replace(/\n/g, " ").length + 1; // +1 for space separator
    if (matchIndex >= charOffset && matchIndex < charOffset + cueTextLen) {
      // Found the cue — use word-level timing if available
      if (cue.words && cue.words.length > 0) {
        // Try to find the start word
        const matchWords = matchText.toLowerCase().split(/\s+/);
        const firstMatchWord = matchWords[0].replace(/[^a-z0-9₹$]/g, "");

        for (const word of cue.words) {
          const cueWord = word.word.toLowerCase().replace(/[^a-z0-9₹$]/g, "");
          if (cueWord === firstMatchWord || cueWord.includes(firstMatchWord)) {
            return { startMs: word.startMs, endMs: cue.endMs };
          }
        }
      }
      return { startMs: cue.startMs, endMs: cue.endMs };
    }
    charOffset += cueTextLen;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Extract key facts from subtitle cues.
 *
 * Scans narration text for concrete data patterns (acreage, price,
 * distance, road access, trees, borewells, approvals, etc.) and
 * extracts ONLY the short data nugget — not the full sentence.
 *
 * Example: from "escape to your dream farmland just 12 kilometers
 * from Mysore" → extracts just "12 KM from Mysore"
 */
export function extractKeyFacts(
  narrationText: string,
  cues: SubtitleCue[]
): KeyFact[] {
  if (!narrationText.trim() || cues.length === 0) return [];

  // Build full narration text from cues (so character positions align)
  const fullText = cues.map((c) => c.text.replace(/\n/g, " ")).join(" ");

  const seen = new Set<string>();
  const facts: KeyFact[] = [];
  let factIndex = 0;

  for (const pattern of FACT_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(fullText)) !== null) {
      let rawText = match[0].trim();

      // Apply formatter if available
      if (pattern.format) {
        rawText = pattern.format(rawText);
      }

      // Skip very short matches
      if (rawText.length < 3) continue;

      // De-duplicate (case-insensitive)
      const key = rawText.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) continue;

      // Also check for substring duplicates
      let isDup = false;
      for (const s of seen) {
        if (s.includes(key) || key.includes(s)) { isDup = true; break; }
      }
      if (isDup) continue;
      seen.add(key);

      // Find timing
      const timing = findMatchTiming(cues, rawText, match.index, fullText);
      if (!timing) continue;

      // Enforce minimum display duration of 2.5 seconds
      const endMs = Math.max(timing.endMs, timing.startMs + 2500);

      // Title-case for display
      const displayText = titleCase(rawText);

      facts.push({
        id: `fact-${factIndex++}-${Math.random().toString(36).slice(2, 6)}`,
        text: displayText,
        category: pattern.category,
        startMs: timing.startMs,
        endMs,
      });
    }
  }

  // Sort by start time
  facts.sort((a, b) => a.startMs - b.startMs);

  // Prevent overlap
  for (let i = 1; i < facts.length; i++) {
    const prevEnd = facts[i - 1].endMs;
    if (facts[i].startMs < prevEnd) {
      facts[i].startMs = prevEnd;
      if (facts[i].endMs < facts[i].startMs + 2000) {
        facts[i].endMs = facts[i].startMs + 2000;
      }
    }
  }

  // Limit to 8 facts
  return facts.slice(0, 8);
}
