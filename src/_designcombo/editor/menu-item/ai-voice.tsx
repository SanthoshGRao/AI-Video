"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Pause, Play, Check, Mic, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useProjectEditor } from "../context/project-editor-context";
import { dispatch } from "@designcombo/events";
import { DESIGN_LOAD } from "@designcombo/state";
import { editorStateManager } from "../state-manager";
import { loadProjectAssets } from "@/lib/editor/load-project-assets";
import { projectAssetsToDesign } from "@/lib/editor/designcombo-adapter";
import { GEMINI_VOICES, TTS_LANGUAGES } from "@/lib/tts/voices";

type Voice = {
  id: string;
  name: string;
  gender: string;
  description: string;
};

type GenderFilter = "all" | "male" | "female";

const PROJECT_VOICES: Voice[] = GEMINI_VOICES.map((voice) => ({
  id: voice.name,
  name: voice.name,
  gender: voice.gender,
  description: voice.tone,
}));

export const AiVoice = () => {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressState, setProgressState] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState("kn-IN");
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [hoveredVoiceId, setHoveredVoiceId] = useState<string | null>(null);

  const ctx = useProjectEditor();
  const projectId = ctx?.projectId;

  const filteredVoices = useMemo(() => {
    if (genderFilter === "all") return PROJECT_VOICES;
    return PROJECT_VOICES.filter((v) => v.gender === genderFilter);
  }, [genderFilter]);

  const handlePlayPause = async (voice: Voice) => {
    if (currentlyPlayingId === voice.id) {
      if (audioElement) {
        audioElement.pause();
        setCurrentlyPlayingId(null);
        setAudioElement(null);
      }
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    try {
      toast.info(`Previewing ${voice.name}...`);
      setCurrentlyPlayingId(voice.id);
      setTimeout(() => setCurrentlyPlayingId(null), 3000);
    } catch (e) {
      console.error(e);
      setCurrentlyPlayingId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
      }
    };
  }, [audioElement]);

  const handleGenerate = async () => {
    if (!text.trim() || !selectedVoice) return;
    if (!projectId) {
      toast.error("Save the project first before generating voiceover");
      return;
    }

    setIsGenerating(true);
    setProgressState("Generating Voice... (Gemini TTS)");

    try {
      const voiceRes = await fetch(
        `/api/projects/${projectId}/tts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceType: selectedVoice.id,
            languageCode: selectedLanguage,
          }),
        }
      );

      if (!voiceRes.ok) {
        const err = await voiceRes.json().catch(() => ({}));
        throw new Error(err.error || `Voiceover API returned ${voiceRes.status}`);
      }

      const voiceData = await voiceRes.json();
      const audioAssetId = voiceData.audioAsset?.id;
      if (!audioAssetId) throw new Error("No audio asset ID returned");

      setProgressState("Generating Subtitles... (Whisper)");

      await fetch(`/api/projects/${projectId}/subtitles/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioAssetId }),
      });

      setProgressState("Timeline Integration...");

      const loaded = await loadProjectAssets({ projectId, audio: voiceData.audioAsset });
      const design = projectAssetsToDesign({
        projectId,
        loaded,
        aspect: {
          width: loaded.timeline?.settings?.width ?? 1080,
          height: loaded.timeline?.settings?.height ?? 1920,
        },
      });

      editorStateManager.updateState(
        { size: design.size, fps: design.fps, duration: design.duration },
        { updateHistory: false }
      );
      dispatch(DESIGN_LOAD, { payload: design });

      setProgressState("Completed");
      toast.success("Voice & subtitles ready!");
    } catch (error) {
      console.error("Error generating voice:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate voice.");
    } finally {
      setIsGenerating(false);
      setTimeout(() => setProgressState(""), 2000);
    }
  };

  const charCount = text.length;

  return (
    <div
      data-testid="panel-ai-voice"
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        maxWidth: "100%",
        background: "linear-gradient(180deg, #0a0a12 0%, #0d0d18 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid rgba(124,58,237,0.12)",
          background: "linear-gradient(90deg, rgba(124,58,237,0.06) 0%, transparent 100%)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Mic className="w-4 h-4 text-white" />
        </div>
        <div>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>
            AI Voice Studio
          </div>
          <div style={{ color: "#71717a", fontSize: 10, fontWeight: 500 }}>
            Powered by Gemini TTS
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Script Input */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Script
              </label>
              <span style={{ fontSize: 10, color: charCount > 0 ? "#7c3aed" : "#52525b", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                {charCount} chars
              </span>
            </div>
            <div
              style={{
                position: "relative",
                borderRadius: 12,
                padding: 1,
                background: text.length > 0
                  ? "linear-gradient(135deg, rgba(124,58,237,0.4) 0%, rgba(168,85,247,0.2) 100%)"
                  : "rgba(255,255,255,0.06)",
                transition: "background 0.3s ease",
              }}
            >
              <Textarea
                placeholder="Type or paste your narration script here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isGenerating}
                style={{
                  minHeight: 90,
                  resize: "none",
                  background: "#0f0f1a",
                  border: "none",
                  borderRadius: 11,
                  color: "#e4e4e7",
                  fontSize: 12,
                  lineHeight: "1.6",
                  padding: "12px 14px",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Language Pills */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
              Language
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TTS_LANGUAGES.map((lang) => {
                const isActive = selectedLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => !isGenerating && setSelectedLanguage(lang.code)}
                    disabled={isGenerating}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 500,
                      border: "none",
                      cursor: isGenerating ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      background: isActive
                        ? "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)"
                        : "rgba(255,255,255,0.06)",
                      color: isActive ? "#fff" : "#a1a1aa",
                      boxShadow: isActive ? "0 2px 12px rgba(124,58,237,0.3)" : "none",
                      opacity: isGenerating ? 0.5 : 1,
                    }}
                  >
                    {lang.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gender Filter Tabs */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Voices
              </label>
              <span style={{ fontSize: 10, color: "#52525b", fontWeight: 500 }}>
                {filteredVoices.length} available
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 2,
                padding: 3,
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                marginBottom: 10,
              }}
            >
              {(["all", "male", "female"] as GenderFilter[]).map((filter) => {
                const isActive = genderFilter === filter;
                const label = filter === "all" ? "All" : filter === "male" ? "♂ Male" : "♀ Female";
                return (
                  <button
                    key={filter}
                    onClick={() => setGenderFilter(filter)}
                    disabled={isGenerating}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 500,
                      border: "none",
                      cursor: isGenerating ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      background: isActive ? "rgba(124,58,237,0.2)" : "transparent",
                      color: isActive ? "#c4b5fd" : "#71717a",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Voice Cards Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                maxHeight: 280,
                overflowY: "auto",
                paddingRight: 4,
                // Custom scrollbar styling
              }}
              className="scrollbar-thin scrollbar-thumb-purple-900/30 scrollbar-track-transparent"
            >
              {filteredVoices.map((voice) => {
                const isSelected = selectedVoice?.id === voice.id;
                const isHovered = hoveredVoiceId === voice.id;
                const isPlaying = currentlyPlayingId === voice.id;
                const isMale = voice.gender === "male";

                return (
                  <button
                    key={voice.id}
                    onClick={() => !isGenerating && setSelectedVoice(voice)}
                    onMouseEnter={() => setHoveredVoiceId(voice.id)}
                    onMouseLeave={() => setHoveredVoiceId(null)}
                    disabled={isGenerating}
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 4,
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: isSelected
                        ? "1.5px solid rgba(124,58,237,0.6)"
                        : "1px solid rgba(255,255,255,0.06)",
                      background: isSelected
                        ? "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(168,85,247,0.06) 100%)"
                        : isHovered
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(255,255,255,0.02)",
                      cursor: isGenerating ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      textAlign: "left",
                      boxShadow: isSelected
                        ? "0 0 20px rgba(124,58,237,0.15), inset 0 1px 0 rgba(255,255,255,0.06)"
                        : isHovered
                          ? "0 2px 8px rgba(0,0,0,0.2)"
                          : "none",
                      transform: isHovered && !isSelected ? "translateY(-1px)" : "none",
                      opacity: isGenerating ? 0.5 : 1,
                      overflow: "hidden",
                    }}
                  >
                    {/* Selected checkmark */}
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      </div>
                    )}

                    {/* Voice Name Row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                      <span
                        style={{
                          fontSize: 10,
                          borderRadius: 4,
                          padding: "1px 4px",
                          background: isMale ? "rgba(59,130,246,0.15)" : "rgba(236,72,153,0.15)",
                          color: isMale ? "#93c5fd" : "#f9a8d4",
                          fontWeight: 600,
                          lineHeight: 1,
                        }}
                      >
                        {isMale ? "♂" : "♀"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: isSelected ? "#e9d5ff" : "#d4d4d8",
                          letterSpacing: "-0.01em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {voice.name}
                      </span>
                    </div>

                    {/* Tone description */}
                    <span
                      style={{
                        fontSize: 9,
                        color: isSelected ? "#a78bfa" : "#52525b",
                        fontWeight: 500,
                        lineHeight: "1.3",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "100%",
                      }}
                    >
                      {voice.description}
                    </span>

                    {/* Playing indicator */}
                    {isPlaying && (
                      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 10, marginTop: 2 }}>
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            style={{
                              width: 2,
                              borderRadius: 1,
                              background: "#a855f7",
                              animation: `voiceWave 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Voice Info Bar */}
          {selectedVoice && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(168,85,247,0.05) 100%)",
                border: "1px solid rgba(124,58,237,0.15)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e9d5ff", letterSpacing: "-0.01em" }}>
                  {selectedVoice.name}
                </div>
                <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 500, marginTop: 1 }}>
                  {selectedVoice.gender === "male" ? "♂ Male" : "♀ Female"} · {selectedVoice.description}
                </div>
              </div>
              <button
                onClick={() => handlePlayPause(selectedVoice)}
                disabled={isGenerating}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(124,58,237,0.2)",
                  color: "#c4b5fd",
                  cursor: isGenerating ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
              >
                {currentlyPlayingId === selectedVoice.id ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" style={{ marginLeft: 1 }} />
                )}
              </button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Generate Button */}
      <div
        style={{
          padding: "12px 14px 14px",
          borderTop: "1px solid rgba(124,58,237,0.1)",
          background: "linear-gradient(180deg, transparent 0%, rgba(124,58,237,0.03) 100%)",
        }}
      >
        <button
          onClick={handleGenerate}
          disabled={!text.trim() || !selectedVoice || isGenerating}
          style={{
            width: "100%",
            padding: "12px 20px",
            borderRadius: 12,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            cursor: !text.trim() || !selectedVoice || isGenerating ? "not-allowed" : "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background:
              !text.trim() || !selectedVoice
                ? "rgba(255,255,255,0.06)"
                : isGenerating
                  ? "linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(168,85,247,0.2) 100%)"
                  : "linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #a855f7 100%)",
            color:
              !text.trim() || !selectedVoice
                ? "#52525b"
                : "#fff",
            boxShadow:
              text.trim() && selectedVoice && !isGenerating
                ? "0 4px 20px rgba(124,58,237,0.4), 0 1px 3px rgba(0,0,0,0.2)"
                : "none",
            letterSpacing: "-0.01em",
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progressState}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate Voiceover</span>
            </>
          )}
        </button>
      </div>

      {/* CSS Keyframes for wave animation */}
      <style>{`
        @keyframes voiceWave {
          0% { height: 3px; }
          100% { height: 10px; }
        }
      `}</style>
    </div>
  );
};
