export type VoicePersonaConfig = {
  label: string;
  languageCode: string;
  /** OpenAI TTS voice name (legacy fallback) */
  gptVoice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "ash" | "coral" | "sage" | "ballad";
  /** The provider to use for audio generation */
  provider: "google" | "openai" | "edge";
  /** Microsoft Edge TTS voice ID, used when provider is 'edge' */
  edgeVoiceId?: string;
  /** Google Gemini TTS voice name (e.g. "Kore", "Puck", "Charon") */
  geminiVoice?: string;
  /** Google Cloud TTS voice name fallback (e.g. "en-US-Wavenet-D") */
  cloudVoiceName?: string;
  prompt: string;
  description: string;
  gender: "male" | "female" | "neutral";
  category: string;
  avatarId?: string;
};

type VoiceGender = VoicePersonaConfig["gender"];

export const TTS_LANGUAGES = [
  { label: "Kannada", code: "kn-IN" },
  { label: "English (US)", code: "en-US" },
  { label: "English (UK)", code: "en-GB" },
  { label: "English (India)", code: "en-IN" },
  { label: "Hindi", code: "hi-IN" },
] as const;

/**
 * All available Gemini TTS voices.
 * These work with any language via the Gemini 2.5 Flash TTS model.
 */
export const GEMINI_VOICES = [
  { name: "Achernar", gender: "female", tone: "Rich, resonant" },
  { name: "Achird", gender: "male", tone: "Bright, cheerful" },
  { name: "Algenib", gender: "male", tone: "Strong, confident" },
  { name: "Algieba", gender: "male", tone: "Smooth, soothing" },
  { name: "Alnilam", gender: "male", tone: "Narrative, storytelling" },
  { name: "Aoede", gender: "female", tone: "Melodic, elegant" },
  { name: "Autonoe", gender: "female", tone: "Gentle, calming" },
  { name: "Callirrhoe", gender: "female", tone: "Crisp, articulate" },
  { name: "Charon", gender: "male", tone: "Deep, authoritative" },
  { name: "Despina", gender: "female", tone: "Lively, engaging" },
  { name: "Enceladus", gender: "male", tone: "Deep, cinematic" },
  { name: "Erinome", gender: "female", tone: "Soft, intimate" },
  { name: "Fenrir", gender: "male", tone: "Bold, powerful" },
  { name: "Gacrux", gender: "female", tone: "Warm, approachable" },
  { name: "Iapetus", gender: "male", tone: "Dramatic, intense" },
  { name: "Kore", gender: "female", tone: "Warm, friendly" },
  { name: "Laomedeia", gender: "female", tone: "Refined, polished" },
  { name: "Leda", gender: "female", tone: "Clear, professional" },
  { name: "Orus", gender: "male", tone: "Calm, measured" },
  { name: "Pulcherrima", gender: "female", tone: "Luxurious, premium" },
  { name: "Puck", gender: "male", tone: "Energetic, youthful" },
  { name: "Rasalgethi", gender: "male", tone: "Trustworthy, sincere" },
  { name: "Sadachbia", gender: "male", tone: "Friendly, casual" },
  { name: "Sadaltager", gender: "male", tone: "Formal, executive" },
  { name: "Schedar", gender: "male", tone: "Vibrant, dynamic" },
  { name: "Sulafat", gender: "female", tone: "Warm, maternal" },
  { name: "Umbriel", gender: "male", tone: "Mysterious, deep" },
  { name: "Vindemiatrix", gender: "female", tone: "Sophisticated, classy" },
  { name: "Zephyr", gender: "female", tone: "Light, airy" },
  { name: "Zubenelgenubi", gender: "male", tone: "Neutral, versatile" },
] as const;

function resolveLanguage(languageCode: string | undefined) {
  return TTS_LANGUAGES.find((language) => language.code === languageCode) ?? TTS_LANGUAGES[0];
}

function fallbackGptVoice(gender: VoiceGender): VoicePersonaConfig["gptVoice"] {
  if (gender === "male") return "onyx";
  if (gender === "female") return "coral";
  return "alloy";
}

export function createGeminiVoicePersona(
  voiceName: string,
  languageCode?: string
): VoicePersonaConfig | null {
  const voice = GEMINI_VOICES.find((item) => item.name === voiceName);
  if (!voice) return null;

  const language = resolveLanguage(languageCode);
  return {
    label: `${voice.name} - ${language.label}`,
    languageCode: language.code,
    gptVoice: fallbackGptVoice(voice.gender),
    provider: "google",
    geminiVoice: voice.name,
    description: voice.tone,
    gender: voice.gender,
    category: "Gemini",
    prompt: `Speak in ${language.label} with a natural real-estate narration tone.`,
  };
}

export const VOICE_PERSONAS: Record<string, VoicePersonaConfig> = {
  /* ===== Kannada Voices (Google Gemini) ===== */
  "Kannada Male Professional": {
    label: "Kannada Male Professional",
    languageCode: "kn-IN",
    gptVoice: "ash",
    provider: "google",
    geminiVoice: "Charon",
    edgeVoiceId: "kn-IN-GaganNeural",
    description: "Professional property consultant — deep, authoritative",
    gender: "male",
    category: "Professional",
    prompt: "Speak in natural Kannada with clear, professional real-estate narration. Use a confident, authoritative tone. Mix English property terms naturally.",
  },
  "Kannada Female Professional": {
    label: "Kannada Female Professional",
    languageCode: "kn-IN",
    gptVoice: "coral",
    provider: "google",
    geminiVoice: "Kore",
    edgeVoiceId: "kn-IN-SapnaNeural",
    description: "Premium real estate presenter — warm, friendly",
    gender: "female",
    category: "Professional",
    prompt: "Speak in warm Kannada with engaging real-estate tone. Be enthusiastic and welcoming. Mix English property terms naturally.",
  },
  "Kannada Friendly Agent": {
    label: "Kannada Friendly Agent",
    languageCode: "kn-IN",
    gptVoice: "echo",
    provider: "google",
    geminiVoice: "Puck",
    edgeVoiceId: "kn-IN-GaganNeural",
    description: "Local conversational — energetic, youthful",
    gender: "male",
    category: "Conversational",
    prompt: "Speak in a friendly, conversational Kannada tone for local real estate. Be energetic and approachable.",
  },
  "Kannada Luxury Narrator": {
    label: "Kannada Luxury Narrator",
    languageCode: "kn-IN",
    gptVoice: "sage",
    provider: "google",
    geminiVoice: "Aoede",
    edgeVoiceId: "kn-IN-SapnaNeural",
    description: "Premium villa/land showcase — elegant, melodic",
    gender: "female",
    category: "Luxury",
    prompt: "Speak in an elegant, premium Kannada tone suited for luxury villas and lands. Be sophisticated and refined.",
  },
  "Kannada Investment Advisor": {
    label: "Kannada Investment Advisor",
    languageCode: "kn-IN",
    gptVoice: "onyx",
    provider: "google",
    geminiVoice: "Fenrir",
    edgeVoiceId: "kn-IN-GaganNeural",
    description: "Analytical investment style — bold, powerful",
    gender: "male",
    category: "Corporate",
    prompt: "Speak in a confident, analytical Kannada tone for property investments. Be authoritative and persuasive.",
  },

  /* ===== Hindi Voices (Google Gemini) ===== */
  "Hindi Male Professional": {
    label: "Hindi Male Professional",
    languageCode: "hi-IN",
    gptVoice: "ash",
    provider: "google",
    geminiVoice: "Achernar",
    edgeVoiceId: "hi-IN-MadhurNeural",
    description: "Professional property consultant — rich, resonant",
    gender: "male",
    category: "Professional",
    prompt: "Speak in clear, professional Hindi for real estate marketing. Be confident and trustworthy.",
  },
  "Hindi Female Professional": {
    label: "Hindi Female Professional",
    languageCode: "hi-IN",
    gptVoice: "coral",
    provider: "google",
    geminiVoice: "Leda",
    edgeVoiceId: "hi-IN-SwaraNeural",
    description: "Premium real estate presenter — clear, professional",
    gender: "female",
    category: "Professional",
    prompt: "Speak in warm, professional Hindi for real estate marketing. Be engaging and trustworthy.",
  },
  "Hindi + English Realtor": {
    label: "Hindi + English Realtor",
    languageCode: "hi-IN",
    gptVoice: "nova",
    provider: "google",
    geminiVoice: "Despina",
    edgeVoiceId: "hi-IN-SwaraNeural",
    description: "Modern bilingual agent — lively, engaging",
    gender: "female",
    category: "Conversational",
    prompt: "Speak in Hindi with natural English property terms. Be modern, relatable and enthusiastic.",
  },

  /* ===== English Voices (Google Gemini) ===== */
  "Professional Male (US)": {
    label: "Professional Male (US)",
    languageCode: "en-US",
    gptVoice: "ash",
    provider: "google",
    geminiVoice: "Orus",
    description: "Confident American male — calm, measured",
    gender: "male",
    category: "Professional",
    prompt: "Speak in a confident, professional American male voice for luxury real estate.",
  },
  "Professional Female (US)": {
    label: "Professional Female (US)",
    languageCode: "en-US",
    gptVoice: "coral",
    provider: "google",
    geminiVoice: "Laomedeia",
    description: "Confident American female — refined, polished",
    gender: "female",
    category: "Professional",
    prompt: "Speak in a confident, professional American female voice.",
  },
  "Friendly Female (US)": {
    label: "Friendly Female (US)",
    languageCode: "en-US",
    gptVoice: "nova",
    provider: "google",
    geminiVoice: "Achird",
    description: "Upbeat social video voice — bright, cheerful",
    gender: "female",
    category: "Conversational",
    prompt: "Speak in a friendly, upbeat American female voice for real estate social video.",
  },
  "Sophisticated British Narrator": {
    label: "Sophisticated British Narrator",
    languageCode: "en-GB",
    gptVoice: "ballad",
    provider: "google",
    geminiVoice: "Alnilam",
    description: "Refined British English — narrative, storytelling",
    gender: "male",
    category: "Luxury",
    prompt: "Speak in a refined British English tone suited for premium property marketing. Be elegant and sophisticated.",
  },
  "Luxury Property Expert": {
    label: "Luxury Property Expert",
    languageCode: "en-US",
    gptVoice: "sage",
    provider: "google",
    geminiVoice: "Pulcherrima",
    description: "Elegant, high-end tone — luxurious, premium",
    gender: "female",
    category: "Luxury",
    prompt: "Speak in an elegant, sophisticated voice for multi-million dollar listings.",
  },
  "Documentary Narrator": {
    label: "Documentary Narrator",
    languageCode: "en-US",
    gptVoice: "fable",
    provider: "google",
    geminiVoice: "Enceladus",
    description: "Storytelling and engaging — deep, cinematic",
    gender: "male",
    category: "Storytelling",
    prompt: "Speak in an engaging, narrative style like a property documentary. Be immersive and captivating.",
  },
  "Young Influencer": {
    label: "Young Influencer",
    languageCode: "en-US",
    gptVoice: "echo",
    provider: "google",
    geminiVoice: "Puck",
    description: "Energetic and relatable — youthful",
    gender: "male",
    category: "Social Media",
    prompt: "Speak with high energy for TikTok/Reels style property tours.",
  },
  "YouTube Shorts Host": {
    label: "YouTube Shorts Host",
    languageCode: "en-US",
    gptVoice: "nova",
    provider: "google",
    geminiVoice: "Schedar",
    description: "Fast-paced and upbeat — vibrant, dynamic",
    gender: "female",
    category: "Social Media",
    prompt: "Speak in a fast-paced, highly engaging tone for YouTube shorts.",
  },
  "Corporate Presenter": {
    label: "Corporate Presenter",
    languageCode: "en-US",
    gptVoice: "onyx",
    provider: "google",
    geminiVoice: "Sadaltager",
    description: "Formal and authoritative — executive",
    gender: "male",
    category: "Corporate",
    prompt: "Speak in a formal, authoritative tone for commercial real estate.",
  },
  "NRI Property Consultant": {
    label: "NRI Property Consultant",
    languageCode: "en-IN",
    gptVoice: "ballad",
    provider: "google",
    geminiVoice: "Gacrux",
    description: "Global Indian accent — warm, approachable",
    gender: "male",
    category: "Professional",
    prompt: "Speak in a global Indian English accent tailored for NRI investors. Be professional yet relatable.",
  },
};

export const VOICE_PERSONA_LABELS = Object.keys(VOICE_PERSONAS);

/**
 * Get the language display name for instructions.
 */
function getLanguageDisplayName(languageCode: string): string {
  const map: Record<string, string> = {
    "kn-IN": "Kannada",
    "hi-IN": "Hindi",
    "en-US": "American English",
    "en-GB": "British English",
    "en-IN": "Indian English",
  };
  return map[languageCode] ?? "the target language";
}

/**
 * Build speaking instructions for the Gemini TTS model.
 * These are passed as systemInstruction and guide tone, pacing, emphasis, and delivery style.
 * Adapts automatically based on the voice's language and persona.
 */
export function buildSpeakingInstructions(voice: VoicePersonaConfig): string {
  const lang = getLanguageDisplayName(voice.languageCode);
  const isKannada = voice.languageCode === "kn-IN";
  const isHindi = voice.languageCode === "hi-IN";
  const isIndic = isKannada || isHindi;
  const isEnglish = voice.languageCode.startsWith("en-");

  // Kannada gets the detailed, battle-tested director's notes
  if (isKannada) {
    return `# AUDIO PROFILE
You are a natural-sounding Kannada voice-over artist recording a promotional advertisement. Your voice is bright, friendly, and confident — like a real person speaking casually, NOT a dramatic actor. Sound human and conversational first; keep the energy warm and understated rather than exaggerated or performed.

# THE SCENE
You are in a professional recording studio, recording an upbeat promotional video for social media (Instagram Reels, YouTube Shorts). Light upbeat background music is playing. The audience is local Kannada-speaking viewers in Mysuru.

### DIRECTOR'S NOTES

* Language Delivery: Fluent Kannada with clear pronunciation. If English words appear, read them naturally with a Kannada-speaking rhythm. Do not over-accent or dramatize unnecessarily.

* Numbers: Always speak numbers in English (e.g. "40 kilometers", "2.22 acres", "120 trees"). Do NOT translate numbers into Kannada. Keep them sounding natural and modern.

* Place Names & Modern Words: Use modern, casual pronunciations — say "Bangalore" not "Bengaluru", "Mysore" not "Mysuru". Pronounce English loanwords (like "premium", "farmland", "road access") naturally with a modern Kannada-English mix accent, like how young educated locals actually speak.

* Only Read What Is Written: Do not add, explain, translate, improvise, or include headings. Read only the exact script text provided.

* Vocal Tone: Bright, friendly, confident, and positive. The voice should feel like a real person smiling while speaking — warm and inviting, never forced.

* Rhythm: Smooth and lively Kannada flow with a slight bounce. Keep transitions natural with no awkward pauses or dead air.

* Pace: Energetic but understandable. Maintain a steady promotional pace, but do not rush important product or brand names.

* Dynamics: Speak with natural, even projection — no shouting and no exaggerated emphasis. Let the words themselves carry the excitement instead of over-acting them.

* Emotion: Keep the delivery cheerful, trustworthy, and convincing, but understated and human. Do NOT over-express, over-dramatize, or push emotion harder than a real person naturally would in normal speech.

* Naturalness (MOST IMPORTANT): Above all, sound like a real human speaking casually — relaxed, believable, and effortless. Avoid a robotic, sing-song, theatrical, or exaggerated "advertisement" read. When in doubt, dial the expression DOWN.

* Brand/Product Words: Read brand names, product names, contact numbers, and website details clearly and slightly slower for better recall.

### SAMPLE CONTEXT

This voice style is ideal for Kannada-English mix Instagram reels, product ads, gym promos, home-care product videos, event announcements, and local business commercials. The voice should sound natural, warm, youthful, and promotional while staying clear, human, and never over-acted.`;
  }

  // Generic template for all other languages
  const voiceDescription = voice.description || "professional and engaging";
  const voicePrompt = voice.prompt || `Speak in a professional ${lang} voice.`;

  const indicNotes = isIndic ? `
* Language Mix: When English words appear in the script, read them naturally with a ${lang}-speaking rhythm. Do not over-accent or switch to a different speaking style for English words.

* Numbers: Speak numbers naturally. Keep them sounding modern and conversational.

* Place Names: Use modern, commonly used pronunciations for place names.` : "";

  const englishNotes = isEnglish ? `
* Accent: Maintain a natural, consistent ${lang} accent throughout the entire reading.

* Technical Terms: Pronounce real estate terminology clearly and confidently.` : "";

  return `# AUDIO PROFILE
You are a professional voice-over artist. Your voice archetype: ${voiceDescription}.
${voicePrompt}

# THE SCENE
You are in a professional recording studio, recording a promotional real estate video for social media.

### DIRECTOR'S NOTES

* Only Read What Is Written: Do not add, explain, translate, improvise, or include headings. Read only the exact script text provided.

* Vocal Tone: Professional, confident, and engaging. The voice should feel warm and trustworthy.

* Rhythm: Smooth, natural flow. Keep transitions natural with no awkward pauses or dead air.

* Pace: Clear and well-paced. Do not rush, but maintain energy throughout.

* Dynamics: Good projection without shouting. Emphasize key selling points naturally.

* Emotion: The delivery should feel trustworthy, professional, and convincing.

* Brand/Product Words: Read brand names, property names, contact numbers, and website details clearly and slightly slower for better recall.
${indicNotes}${englishNotes}

### CONTEXT
This is a real estate promotional video narration. Maintain a consistent voice throughout the entire script.`;
}

/**
 * Build condensed speaking instructions for TTS.
 * Shorter version used as a fallback. Adapts based on voice language/persona.
 */
export function buildCondensedSpeakingInstructions(voice: VoicePersonaConfig): string {
  const lang = getLanguageDisplayName(voice.languageCode);
  const isKannada = voice.languageCode === "kn-IN";

  if (isKannada) {
    return `### DIRECTOR'S NOTES

* Language Delivery: Fluent Kannada with clear pronunciation. If English words appear, read them naturally with a Kannada-speaking rhythm. Do not over-accent or dramatize unnecessarily.

* Numbers: Always speak numbers in English (e.g. "40 kilometers", "2.22 acres", "120 trees"). Do NOT translate numbers into Kannada. Keep them sounding natural and modern.

* Only Read What Is Written: Do not add, explain, translate, improvise, or include headings. Read only the exact script text provided.

* Vocal Tone: Bright, friendly, confident, and positive. The voice should feel like a real person smiling while speaking — warm and inviting, never forced.

* Rhythm: Smooth and lively Kannada flow with a slight bounce. Keep transitions natural with no awkward pauses or dead air.

* Pace: Energetic but understandable. Maintain a steady promotional pace, but do not rush important product or brand names.

* Dynamics: Natural, even projection — no shouting and no exaggerated emphasis. Let the words carry the excitement instead of over-acting them.

* Emotion: Cheerful, trustworthy, and convincing, but understated and human. Do NOT over-express or push emotion harder than a real person naturally would.

* Naturalness (MOST IMPORTANT): Sound like a real human speaking casually — relaxed and believable. Avoid a robotic, sing-song, or theatrical read. When in doubt, dial the expression DOWN.

* Brand/Product Words: Read brand names, product names, contact numbers, and website details clearly and slightly slower for better recall.

### SAMPLE CONTEXT

This voice style is ideal for Kannada-English mix Instagram reels, product ads, gym promos, event announcements, and local business commercials. The voice should sound natural, warm, youthful, and promotional while staying clear, human, and never over-acted.`;
  }

  const voiceDescription = voice.description || "professional";
  return `### DIRECTOR'S NOTES

* Voice Style: ${voiceDescription}. ${voice.prompt || `Speak in professional ${lang}.`}

* Only Read What Is Written: Do not add, explain, translate, or improvise. Read only the exact script text provided.

* Vocal Tone: Professional, confident, and engaging. Warm and trustworthy delivery.

* Pace: Clear, well-paced, and energetic without rushing.

* Consistency: Maintain the exact same voice quality and tone throughout the entire script. Do not vary your voice between sentences.

* Brand/Product Words: Read property names, contact numbers, and details clearly.`;
}

/**
 * Built-in delivery-style presets. These are independent of the chosen voice
 * (timbre) — a style controls *how* a line is performed (pace, energy,
 * emotion), while the voice controls *who* is performing it. Users can also
 * write fully custom style instructions instead of picking one of these.
 */
export type StylePreset = {
  id: string;
  label: string;
  tagline: string;
  direction: string;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "natural",
    label: "Natural & Conversational",
    tagline: "Relaxed, human, everyday speech",
    direction:
      "Speak like a real person casually talking to a friend or customer. Relaxed and warm, with natural pauses. Dial expression down — believable over polished, never theatrical.",
  },
  {
    id: "energetic-ad",
    label: "Energetic Ad Read",
    tagline: "Punchy, upbeat promo energy",
    direction:
      "Speak with high energy and enthusiasm, like a hyped promotional ad. Punchy delivery, confident emphasis on selling points, upbeat brisk pace, big smile in the voice.",
  },
  {
    id: "cinematic-trailer",
    label: "Cinematic Trailer",
    tagline: "Dramatic, epic movie-trailer voice",
    direction:
      "Speak with dramatic weight and gravitas, like a movie trailer voice-over. Add deliberate pauses before big reveals, deepen emphasis on powerful words, and build tension and grandeur.",
  },
  {
    id: "luxury-premium",
    label: "Luxury Premium",
    tagline: "Elegant, refined, high-end",
    direction:
      "Speak in an elegant, refined, unhurried tone suited for premium and luxury branding. Smooth and confident, with understated sophistication rather than loud excitement.",
  },
  {
    id: "social-hype",
    label: "Social Hype",
    tagline: "Rapid, viral, high-energy reel voice",
    direction:
      "Speak fast and loud with viral short-form-video energy, like a trending Reels/TikTok host. Snappy phrasing, big excitement, quick transitions with almost no dead air.",
  },
];

export function findStylePreset(styleId: string | undefined | null): StylePreset | undefined {
  if (!styleId) return undefined;
  return STYLE_PRESETS.find((preset) => preset.id === styleId);
}

function buildLanguageDeliveryNotes(languageCode: string): string {
  const isKannada = languageCode === "kn-IN";
  const isHindi = languageCode === "hi-IN";
  const isIndic = isKannada || isHindi;
  const isEnglish = languageCode.startsWith("en-");
  const lang = getLanguageDisplayName(languageCode);

  if (isKannada) {
    return `
* Language Delivery: Fluent Kannada with clear pronunciation. If English words appear, read them naturally with a Kannada-speaking rhythm — do not switch styles for English words.
* Numbers: Always speak numbers in English (e.g. "40 kilometers", "2.22 acres"). Do NOT translate numbers into Kannada.
* Place Names & Modern Words: Use modern, casual pronunciations — say "Bangalore" not "Bengaluru", "Mysore" not "Mysuru". Pronounce English loanwords naturally with a modern Kannada-English mix accent.`;
  }
  if (isIndic) {
    return `
* Language Mix: When English words appear in the script, read them naturally with a ${lang}-speaking rhythm.
* Numbers: Speak numbers naturally in English, keep them sounding modern and conversational.
* Place Names: Use modern, commonly used pronunciations for place names.`;
  }
  if (isEnglish) {
    return `
* Accent: Maintain a natural, consistent ${lang} accent throughout the entire reading.
* Technical Terms: Pronounce technical and product terminology clearly and confidently.`;
  }
  return "";
}

/**
 * Build director's-notes style instructions from a built-in style preset.
 * Unlike buildSpeakingInstructions (which derives tone from the voice's own
 * persona), this lets the chosen style override delivery independent of voice.
 */
export function buildStylePresetInstructions(preset: StylePreset, languageCode: string): string {
  const lang = getLanguageDisplayName(languageCode);
  return `# AUDIO PROFILE
You are a professional voice-over artist recording in the "${preset.label}" style.

# THE SCENE
You are in a professional recording studio, recording a promotional video for social media. The target language is ${lang}.

### DIRECTOR'S NOTES

* Style & Energy: ${preset.direction}

* Only Read What Is Written: Do not add, explain, translate, improvise, or include headings. Read only the exact script text provided.
${buildLanguageDeliveryNotes(languageCode)}

* Brand/Product Words: Read brand names, product names, contact numbers, and website details clearly and slightly slower for better recall.

### CONTEXT
This is a promotional narration. Maintain the "${preset.label}" style consistently throughout the entire script.`;
}

/**
 * Convert numerical/enum voice modifiers (pitch, pace, emotion, energy)
 * into natural language director instructions for Gemini TTS.
 */
export function buildVoiceModifiersPrompt(mods?: {
  pitch?: number;
  pace?: number;
  emotion?: string;
  energy?: string;
}): string {
  if (!mods) return "";
  const lines: string[] = [];

  if (typeof mods.pitch === "number" && mods.pitch !== 0) {
    if (mods.pitch === 1) {
      lines.push("* Voice Pitch: High pitch. Speak in a light, cheerful, higher-pitched, funny tone.");
    } else if (mods.pitch === 2) {
      lines.push("* Voice Pitch: Very High pitch / Cartoon. Speak in a comic, squeaky, high-pitched funny character voice.");
    } else if (mods.pitch === -1) {
      lines.push("* Voice Pitch: Low pitch. Speak in a lower-pitched, deeper, warm tone.");
    } else if (mods.pitch === -2) {
      lines.push("* Voice Pitch: Very Low pitch / Deep. Speak in a heavy, deep booming bass voice.");
    }
  }

  if (typeof mods.pace === "number" && mods.pace !== 1.0) {
    if (mods.pace > 1.1) {
      lines.push(`* Voice Pace: Fast (${mods.pace.toFixed(1)}x). Speak briskly with rapid speech speed.`);
    } else if (mods.pace < 0.9) {
      lines.push(`* Voice Pace: Slow (${mods.pace.toFixed(1)}x). Speak deliberately and slowly with clear spacing.`);
    }
  }

  if (mods.emotion && mods.emotion !== "normal") {
    switch (mods.emotion) {
      case "funny":
        lines.push("* Vocal Emotion & Mood: Funny and humorous. Deliver the lines with comic timing and playful expression.");
        break;
      case "excited":
        lines.push("* Vocal Emotion & Mood: Excited and enthusiastic. Deliver the lines with high energy and joy.");
        break;
      case "dramatic":
        lines.push("* Vocal Emotion & Mood: Dramatic. Deliver with intensity and deliberate dramatic pauses.");
        break;
      case "whispering":
        lines.push("* Vocal Emotion & Mood: Soft / Whispering. Deliver in a soft, quiet, intimate voice.");
        break;
      case "sarcastic":
        lines.push("* Vocal Emotion & Mood: Sarcastic. Deliver with a playful, ironic, sarcastic tone.");
        break;
      case "robotic":
        lines.push("* Vocal Emotion & Mood: Monotone / Robotic. Deliver with steady, flat, mechanical cadence.");
        break;
    }
  }

  if (mods.energy && mods.energy !== "balanced") {
    if (mods.energy === "high") {
      lines.push("* Vocal Energy: High energy, loud and dynamic projection.");
    } else if (mods.energy === "relaxed") {
      lines.push("* Vocal Energy: Low energy, calm and relaxed projection.");
    }
  }

  if (lines.length === 0) return "";
  return `\n\n### VOICE MODULATION INSTRUCTIONS\n${lines.join("\n")}`;
}

/**
 * Resolve the final speaking instructions to send to Gemini TTS.
 * Priority: explicit custom instructions (ad-hoc or from a saved preset) >
 * a built-in style preset > the voice's own default persona instructions.
 * Also appends background voice modifiers (pitch, pace, emotion, energy) if present.
 */
export function resolveSpeakingInstructions(params: {
  voice: VoicePersonaConfig;
  styleId?: string | null;
  customInstructions?: string | null;
  pitch?: number;
  pace?: number;
  emotion?: string;
  energy?: string;
}): { full: string; condensed: string; styleLabel?: string } {
  const modPrompt = buildVoiceModifiersPrompt({
    pitch: params.pitch,
    pace: params.pace,
    emotion: params.emotion,
    energy: params.energy,
  });

  const customInstructions = params.customInstructions?.trim();
  if (customInstructions) {
    const fullCustom = customInstructions + modPrompt;
    return { full: fullCustom, condensed: fullCustom, styleLabel: "Custom style" };
  }

  const preset = findStylePreset(params.styleId);
  if (preset) {
    const instructions = buildStylePresetInstructions(preset, params.voice.languageCode) + modPrompt;
    return { full: instructions, condensed: instructions, styleLabel: preset.label };
  }

  return {
    full: buildSpeakingInstructions(params.voice) + modPrompt,
    condensed: buildCondensedSpeakingInstructions(params.voice) + modPrompt,
  };
}

export function resolveVoicePersona(persona: string, languageCode?: string): VoicePersonaConfig {
  console.log(`[VOICE_RESOLUTION] Resolving persona:`, {
    persona,
    languageCode,
    isInVoicePersonas: persona in VOICE_PERSONAS
  });
  
  // First try predefined personas
  if (persona in VOICE_PERSONAS) {
    console.log(`[VOICE_RESOLUTION] Found in VOICE_PERSONAS:`, persona);
    return VOICE_PERSONAS[persona];
  }
  
  // Then try creating a Gemini voice persona
  const geminiPersona = createGeminiVoicePersona(persona, languageCode);
  if (geminiPersona) {
    console.log(`[VOICE_RESOLUTION] Created Gemini persona:`, geminiPersona.label);
    return geminiPersona;
  }
  
  // Last resort - log warning and return default
  console.warn(`[VOICE_RESOLUTION] Persona not found, using fallback: ${persona}. Available personas:`, Object.keys(VOICE_PERSONAS));
  return VOICE_PERSONAS["Kannada Male Professional"];
}
