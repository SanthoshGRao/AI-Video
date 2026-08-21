/**
 * Shared language rules for script generation and refinement.
 *
 * Both `generate-script` and `refine-script` import from here so the two prompts
 * can't drift apart (they did: refine used to ask for transliterated Kannada like
 * "25 ಕಿಲೋಮೀಟರ್", which is exactly what makes the TTS sound robotic).
 */

/**
 * The Bengaluru spoken-Kannada core. This is the part that decides whether the
 * voiceover sounds like a person or a news reader, so it is shared verbatim by
 * generation and refinement.
 */
const BENGALURU_SPOKEN_STYLE = `══════════════════════════════════════
BENGALURU SPOKEN KANNADA — the single most important rule
══════════════════════════════════════
Write the way people actually TALK in Bangalore/Mysuru — not the way Kannada is WRITTEN in newspapers or read on TV news. Bangalore Kannada is fast, clipped, heavily code-mixed and casual. Literary/formal Kannada is the #1 reason a script sounds artificial.

Use the SPOKEN (clipped) form, never the written form:
  ಇರುತ್ತದೆ → ಇರುತ್ತೆ        ಸಿಗುತ್ತದೆ → ಸಿಗುತ್ತೆ        ಆಗುತ್ತದೆ → ಆಗುತ್ತೆ
  ಮಾಡುತ್ತದೆ → ಮಾಡುತ್ತೆ      ಮಾಡುತ್ತೀರಿ → ಮಾಡ್ತೀರಾ      ನೋಡುತ್ತೀರಿ → ನೋಡ್ತೀರಾ
  ಆದರೆ → ಆದ್ರೆ              ಅಂದರೆ → ಅಂದ್ರೆ              ಬಂದರೆ → ಬಂದ್ರೆ
  ನೋಡಿದರೆ → ನೋಡಿದ್ರೆ        ಬೇಕಾದರೆ → ಬೇಕಾದ್ರೆ          ಹಾಗಾಗಿ → ಹಂಗಾಗಿ
  ಇರುವ → ಇರೋ               ಮಾಡುವ → ಮಾಡೋ               ಆಗಿದೆ → ಆಗೋಗಿದೆ (when it fits)
  ಏಕೆಂದರೆ → ಯಾಕಂದ್ರೆ         ಇಲ್ಲವೇ → ಅಲ್ವಾ               ಒಂದು ಬಾರಿ → ಒಂದ್ಸಲ
  ಹುಡುಕುತ್ತಿದ್ದೀರಾ → ಹುಡುಕ್ತಿದೀರಾ   ಆಗಿರಬಹುದು → ಆಗಿರ್ಬೋದು      ಇಲ್ಲವೆ → ಇಲ್ವೆ
  ಹಾಗಿದ್ದರೆ → ಹಾಗಿದ್ರೆ          ಇಷ್ಟವಾಗಿದ್ದರೆ → ಇಷ್ಟ ಆಗಿದ್ರೆ     ಮಾಡಿಕೊಳ್ಳಬೇಡಿ → ಮಾಡ್ಕೊಳ್ಬೇಡಿ
  ಇಂದೇ → ಇವತ್ತೇ             ಬೆಂಗಳೂರಿನಿಂದ → ಬೆಂಗ್ಳೂರಿಂದ      ಮೈಸೂರಿನಿಂದ → ಮೈಸೂರಿಂದ

BANNED — formal/written words that instantly kill the accent:
  ❌ ಲಭ್ಯವಿದೆ, ಹೊಂದಿದೆ, ಒದಗಿಸಲಾಗಿದೆ, ನೆಲೆಗೊಂಡಿದೆ, ಸನಿಹದಲ್ಲಿದೆ, ಆಕರ್ಷಕವಾಗಿದೆ,
     ಸೌಲಭ್ಯಗಳನ್ನು ಒಳಗೊಂಡಿದೆ, ಇರುತ್ತದೆ, ಆಗಿರುತ್ತದೆ, ಮಾಹಿತಿಗಾಗಿ
  ✅ instead: ಇದೆ, ಇರುತ್ತೆ, ಸಿಗುತ್ತೆ, ಆಗುತ್ತೆ, ಸಿಕ್ಕಿದೆ, ಪಕ್ಕದಲ್ಲೇ ಇದೆ, ಸೂಪರ್ ಆಗಿದೆ, ಎಲ್ಲಾ ಇದೆ

Sprinkle real Bangalore conversational markers (2–4 across the script, not more):
  ನೋಡಿ, ಗೊತ್ತಾ, ಅಲ್ವಾ, ಸ್ವಲ್ಪ, ಒಂದ್ಸಲ, ಅಷ್ಟೇ, ಬಿಡಿ, ಮತ್ತೆ, ಏನ್ ಅಂದ್ರೆ, ಹಂಗಾಗಿ, ತಗೊಳ್ಳಿ
Bangalore speech also drops casual English right into the middle of a Kannada sentence — lean into that: "full clear ಇದೆ", "traffic ನೇ ಇಲ್ಲ", "ಒಂದ್ಸಲ visit ಮಾಡಿ", "tension ಇಲ್ಲ", "ready ಆಗಿದೆ", "direct ಆಗಿ".`;

/** Script/formatting rules that apply to BOTH generation and refinement. */
const KANGLISH_SCRIPT_RULES = `══════════════════════════════════════
WHICH SCRIPT TO WRITE EACH WORD IN
══════════════════════════════════════
Decide per word by asking: "when a Bangalore person SAYS this, is it a Kannada word or an English word?"

KANNADA SCRIPT — words Kannada has absorbed and says as its own:
- Native units and measures: ಗುಂಟೆ, ಎಕರೆ, ಲಕ್ಷ, ಕೋಟಿ, ಕಿಲೋಮೀಟರ್, ಅಡಿ
  ✅ "120 ಕಿಲೋಮೀಟರ್", "30 ಗುಂಟೆ usable land", "60 ಲಕ್ಷ"
- Kannada place names, ESPECIALLY with a Kannada case ending attached — never split the suffix off:
  ✅ "ಬೆಂಗ್ಳೂರಿಂದ", "ಮೈಸೂರಿಂದ", "ಮಂಡ್ಯದಿಂದ", "ಪಾಂಡವಪುರದಿಂದ", "ಮೈಸೂರ್ ಹತ್ರ"
  ❌ "Bangalore ಇಂದ", "Mandya ದಿಂದ" ← the split reads badly and breaks the rhythm
- Everyday Kannada words that happen to describe property: ಡಾಂಬರ್, ದೂರದಲ್ಲಿ, ಹತ್ರ, ಬೆಲೆ, ಜಾಗ, ಮರ

LATIN SCRIPT — words that are still English when spoken. Never spell these in Kannada letters:
- Legal/technical/brand: RTC, E-Khata, DC Converted, RERA Approved, borewell, drip irrigation, BESCOM, gated community
- English units & property terms: feet, sq ft, acre, plot, site, layout, road access, coconut trees
- English place names: Sarjapur Road, Electronic City, Outer Ring Road
- Casual English Bangalore drops mid-sentence: investment, opportunity, super, solid, tension, ready, negotiable, call, book, miss, farmhouse, future appreciation
  ✅ "drip irrigation", "40 feet ಡಾಂಬರ್ road access", "RERA Approved", "2400 sq ft", "10 coconut trees"
  ❌ "ಡ್ರಿಪ್ ಇರಿಗೇಶನ್", "ಗೇಟೆಡ್ ಕಮ್ಯೂನಿಟಿ", "ಆರ್ ಈ ಆರ್ ಎ ಅಪ್ರೂವ್ಡ್", "ಸ್ಕ್ವೇರ್ ಫೀಟ್", "ಇನ್ವೆಸ್ಟ್‌ಮೆಂಟ್"
Transliterating an ENGLISH technical term into Kannada letters is the #1 thing that makes the voice sound robotic and misspelled. That ban does NOT extend to genuine Kannada words like ಕಿಲೋಮೀಟರ್ or ಲಕ್ಷ.

══════════════════════════════════════
NUMBER RULES (critical for TTS)
══════════════════════════════════════
- Numbers always in digits: "120", "30", "60", "7".
- NEVER write a decimal point. Always expand: "1.22 acres" → "1 point 22 acre", "6.5 lakhs" → "6 point 5 lakhs".
- NEVER use the ₹ symbol — TTS does not read it reliably. Write "60 ಲಕ್ಷ", not "₹60 ಲಕ್ಷ".

══════════════════════════════════════
CALL TO ACTION (close exactly this way)
══════════════════════════════════════
Two beats, in this order:
1. An urgency nudge in the reference's voice — e.g. "ಇಂಥ opportunity miss ಮಾಡ್ಕೊಳ್ಬೇಡಿ!" or "ಇಂಥ chance ಮತ್ತೆ ಸಿಗಲ್ಲ ಬಿಡಿ." Vary the wording each time.
2. Then this fixed line, VERBATIM, as the last thing in the script:
   "ಸೈಟ್ ವಿಸಿಟ್ ಗೇ WhatsApp ನಲ್ಲಿ D M ಮಾಡಿ"
   (Write "D M" with a space between the letters — required for TTS. This line is the one place transliterated English is allowed; do not "fix" it.)`;

/** Rules that only make sense while WRITING a fresh script. */
const KANGLISH_GENERATE = `You are writing a Kanglish (Kannada + English) voiceover the way a real Bangalore agent actually TALKS to a friend on a call — relaxed, warm, human. NOT an ad read, NOT a brochure, NOT a fact-list.

══════════════════════════════════════
CORE GRAMMAR — the spoken skeleton is Kannada
══════════════════════════════════════
The sentence flows in natural spoken Kannada; English words are dropped in for technical/legal terms, English units, and casual everyday words. The sentence ends on a Kannada verb/particle.
✅ "40 feet ಡಾಂಬರ್ road access ಇದೆ", "ಮೈಸೂರಿಂದ 30 ಕಿಲೋಮೀಟರ್ ದೂರದಲ್ಲಿರೋ 1 acre property"
❌ "The road access is excellent." ← full English sentence, WRONG
❌ "Good location ಇದೆ nice property ಇದೆ" ← vague filler, WRONG

${BENGALURU_SPOKEN_STYLE}

══════════════════════════════════════
STRUCTURE — follow these four beats in order
══════════════════════════════════════
This is a confident agent's pitch delivered warmly, NOT a rambling chat. Keep the beats in order:

1. GREETING + QUALIFYING QUESTION. Open with "ನಮಸ್ಕಾರ!" then ask the buyer what they're looking for, then pivot in.
   e.g. "ನಮಸ್ಕಾರ! ಮೈಸೂರ್ ಹತ್ರ ಒಳ್ಳೆ investment property ಹುಡುಕ್ತಿದೀರಾ? ಹಾಗಿದ್ರೆ, ಇಲ್ಲೊಂದು super opportunity ನಿಮ್ಮಗಾಗಿ."
2. WHERE IT IS + WHAT IT IS. Run the distances from the nearby towns back to back — this rapid-fire list is GOOD here, it's how agents establish location — then land on the size/type.
   e.g. "ಬೆಂಗ್ಳೂರಿಂದ just 120 ಕಿಲೋಮೀಟರ್, ಮೈಸೂರಿಂದ 30 ಕಿಲೋಮೀಟರ್ ದೂರದಲ್ಲಿರೋ 1 acre general property."
3. WHAT YOU GET + WHY IT'S WORTH IT. Road access, usable land, trees, water, amenities — then say what the buyer could DO with it (investment / farmhouse / future appreciation) using "ಆಗಿರ್ಬೋದು … ಆಗಿರ್ಬೋದು".
4. LEGAL + PRICE + CTA. Legal clarity, then the price (mention negotiable if it is), then the closer.

Within that skeleton, make each variation genuinely distinct — a different qualifying question, different use-case framing, a different urgency line. Do not just reshuffle the same sentences.

══════════════════════════════════════
DELIVERY
══════════════════════════════════════
- Vary verb endings — don't end sentence after sentence with "ಇದೆ". Rotate ಇದೆ / ಇರುತ್ತೆ / ಇವೆ / ಸಿಗುತ್ತೆ / ಆಗಿರ್ಬೋದು / ಮಾಡಿ.
- Talk TO the listener throughout: "ಹುಡುಕ್ತಿದೀರಾ?", "ಇಷ್ಟ ಆಗಿದ್ರೆ", "ಗೊತ್ತಾ?", "ಅಲ್ವಾ?".
- Vary rhythm: a punchy short line, then a longer flowing one. Real speech is uneven.
- Warm and confident, with light energy. Not a hard sell, not a monotone read.

══════════════════════════════════════
DON'T
══════════════════════════════════════
- DON'T stack English marketing adjectives ("premium high-appreciation potential property"). Say it plainly — "solid option", "super opportunity" is the right level.
- DON'T reuse the same connector ("ಕೂಡ ಇದೆ … ಜೊತೆಗೆ … ಕೂಡ ಇದೆ") over and over.
- DON'T write full English sentences. Every sentence lands on a Kannada verb/particle.

══════════════════════════════════════
COVER ALL THE IMPORTANT FACTS (a real agent leaves nothing key out)
══════════════════════════════════════
Include every important detail you're given — location & distances, size, price, legal status, road access, water/electricity, and the standout amenities/highlights. Do NOT drop details for the sake of brevity. The skill is fitting them ALL into the four beats above while still sounding spoken.

${KANGLISH_SCRIPT_RULES}

══════════════════════════════════════
GOLD-STANDARD REFERENCE — match this voice, rhythm and script-mixing exactly
══════════════════════════════════════
"ನಮಸ್ಕಾರ! ಮೈಸೂರ್ ಹತ್ರ ಒಳ್ಳೆ investment property ಹುಡುಕ್ತಿದೀರಾ? ಹಾಗಿದ್ರೆ, ಇಲ್ಲೊಂದು super opportunity ನಿಮ್ಮಗಾಗಿ. ಬೆಂಗ್ಳೂರಿಂದ just 120 ಕಿಲೋಮೀಟರ್, ಮೈಸೂರಿಂದ 30 ಕಿಲೋಮೀಟರ್, ಪಾಂಡವಪುರದಿಂದ 7 ಕಿಲೋಮೀಟರ್, ಮಂಡ್ಯದಿಂದ 20 ಕಿಲೋಮೀಟರ್ ದೂರದಲ್ಲಿರೋ 1 acre general property. Property ಗೆ 40 feet ಡಾಂಬರ್ road access ಇದೆ. ಸುಮಾರು 30 ಗುಂಟೆ usable land, ಜೊತೆಗೆ 10 coconut trees ಕೂಡ ಇವೆ. Investment ಆಗಿರ್ಬೋದು, farmhouse ಆಗಿರ್ಬೋದು, future appreciation ಗೂ ಇದು ಒಂದು solid option. RTC clear ಇದೆ, legal clarity ಬಗ್ಗೆ tension ಇಲ್ವೆ. Total price 60 ಲಕ್ಷ, ಸ್ವಲ್ಪ negotiable ಕೂಡ ಇದೆ. ಇಷ್ಟ ಆಗಿದ್ರೆ ಇವತ್ತೇ site visit book ಮಾಡಿ, ಇಂಥ opportunity miss ಮಾಡ್ಕೊಳ್ಬೇಡಿ! ಸೈಟ್ ವಿಸಿಟ್ ಗೇ WhatsApp ನಲ್ಲಿ D M ಮಾಡಿ."

Copy from this: the greeting, the qualifying question, the rapid distance run, "ಆಗಿರ್ಬೋದು … ಆಗಿರ್ಬೋದು", the "tension ಇಲ್ವೆ" legal beat, the urgency close, and above all WHICH words are in Kannada letters vs English letters.
Do NOT copy: its specific towns, numbers or facts. Use ONLY the facts you are given.`;

const KANNADA_ONLY = `entirely in Kannada (ಕನ್ನಡ) — no English words except unavoidable proper nouns.
Use spoken Bangalore Kannada, not written/literary Kannada (ಇರುತ್ತೆ not ಇರುತ್ತದೆ, ಆದ್ರೆ not ಆದರೆ, ಇರೋ not ಇರುವ). Avoid ಲಭ್ಯವಿದೆ / ಹೊಂದಿದೆ / ನೆಲೆಗೊಂಡಿದೆ — they sound like a news reader.
Strict TTS-ready rules:
- Format all decimal numbers by writing them out using the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Write other numbers in digits.`;

export const GENERATE_LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  english: `Write the script entirely in English.
Strict TTS-ready rules:
- Format all decimal numbers by writing them out with 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Ensure the script is natural, conversational, and direct.`,

  kannada: `Write the script ${KANNADA_ONLY}`,

  kannada_english: KANGLISH_GENERATE,

  hindi_english: `Write the script in a natural, highly engaging conversational hybrid mix of Hindi (हिन्दी) and English (commonly known as Hinglish), roughly 50/50 mix.

Style Guidelines:
- Decimals: Format all decimal numbers by writing them out with the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Numbers/Quantities: Use English digits for measurements, sizes, prices, distances, and road widths (e.g. "30 feet road", "65 lakhs", "25 किलोमीटर", "42 नारियल के पेड़").
- Technical/Legal property facts: Use English terms (e.g., "RTC available", "drip irrigation done", "borewell", "electricity available", "legal clarity", "smooth entry").
- Sentence Flow: Connect facts with natural conversational Hindi verbs and particles.
- Sentence Structure: Do NOT generate full English sentences. The overall sentence structure must be Hindi-driven, ending in Hindi verbs/particles. Only embed English nouns, adjectives, or short phrases inside the Hindi flow.
- Call to Action: Use a hybrid phrasing like "साइट विजिट के लिए WhatsApp पर D M करें".`,
};

export const REFINE_LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  english: `Keep the script entirely in English.
Strict TTS-ready rules:
- Format all decimal numbers by writing them out with 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Ensure the script is natural, conversational, and direct.`,

  kannada: `Keep the script ${KANNADA_ONLY}`,

  kannada_english: `Keep the script as a Kanglish (Kannada + English) voiceover spoken the way a real Bangalore agent talks to a friend — the Kannada carries the sentence, English words are dropped in.

${BENGALURU_SPOKEN_STYLE}

While refining, actively convert any formal/written Kannada the original script still has into the spoken Bangalore form above, and keep the listener-facing feel (ನೋಡಿ, ಗೊತ್ತಾ, ಅಲ್ವಾ). Do NOT turn it into a fact-list, and do not drop facts that are already in the script.

${KANGLISH_SCRIPT_RULES}`,

  hindi_english: `Keep the script in a natural, highly engaging conversational hybrid mix of Hindi (हिन्दी) and English (commonly known as Hinglish), roughly 50/50 mix.

Style Guidelines:
- Decimals: Format all decimal numbers by writing them out with the English word 'point' as text (e.g. '1.22' must be written as '1 point 22') to ensure correct pronunciation by text-to-speech engines. Do NOT use dot notation (like '1.22') in the script.
- Numbers/Quantities: Use English digits for measurements, sizes, prices, distances, and road widths (e.g. "30 feet road", "65 lakhs", "25 किलोमीटर", "42 नारियल के पेड़").
- Technical/Legal property facts: Use English terms (e.g., "RTC available", "drip irrigation done", "borewell", "electricity available", "legal clarity", "smooth entry").
- Sentence Flow: Connect facts with natural conversational Hindi verbs and particles.
- Sentence Structure: Do NOT generate full English sentences. The overall sentence structure must be Hindi-driven, ending in Hindi verbs/particles. Only embed English nouns, adjectives, or short phrases inside the Hindi flow.
- Call to Action: Use a hybrid phrasing like "साइट विजिट के लिए WhatsApp पर D M करें".`,
};
