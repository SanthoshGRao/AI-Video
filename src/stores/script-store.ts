import { create } from "zustand";
import type { ExtractedFacts, ScriptVersion } from "@/types";

interface ScriptState {
  rawInput: string;
  extractedFacts: ExtractedFacts | null;
  variations: ScriptVersion[];
  activeVariationId: string | null;
  editorContent: string;
  isExtracting: boolean;
  isGenerating: boolean;
  isRefining: boolean;
  selectedTemplate: string | null;
  selectedDuration: number;

  setRawInput: (input: string) => void;
  setExtractedFacts: (facts: ExtractedFacts | null) => void;
  setVariations: (variations: ScriptVersion[]) => void;
  addVariation: (variation: ScriptVersion) => void;
  setActiveVariation: (id: string | null) => void;
  setEditorContent: (content: string) => void;
  setExtracting: (extracting: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setRefining: (refining: boolean) => void;
  setSelectedTemplate: (slug: string | null) => void;
  setSelectedDuration: (seconds: number) => void;
  reset: () => void;
}

const initialState = {
  rawInput: "",
  extractedFacts: null,
  variations: [],
  activeVariationId: null,
  editorContent: "",
  isExtracting: false,
  isGenerating: false,
  isRefining: false,
  selectedTemplate: null,
  selectedDuration: 60,
};

export const useScriptStore = create<ScriptState>((set) => ({
  ...initialState,

  setRawInput: (input) =>
    set({ rawInput: input }),

  setExtractedFacts: (facts) =>
    set({ extractedFacts: facts }),

  setVariations: (variations) =>
    set({ variations }),

  addVariation: (variation) =>
    set((state) => ({
      variations: [...state.variations, variation],
    })),

  setActiveVariation: (id) =>
    set((state) => {
      const variation = state.variations.find((v) => v.id === id);
      return {
        activeVariationId: id,
        editorContent: variation?.content ?? state.editorContent,
      };
    }),

  setEditorContent: (content) =>
    set({ editorContent: content }),

  setExtracting: (extracting) =>
    set({ isExtracting: extracting }),

  setGenerating: (generating) =>
    set({ isGenerating: generating }),

  setRefining: (refining) =>
    set({ isRefining: refining }),

  setSelectedTemplate: (slug) =>
    set({ selectedTemplate: slug }),

  setSelectedDuration: (seconds) =>
    set({ selectedDuration: seconds }),

  reset: () =>
    set(initialState),
}));
