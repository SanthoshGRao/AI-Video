import sys
import os
import argparse
import json
import stable_whisper

def main():
    parser = argparse.ArgumentParser(description="Forced alignment using stable-ts")
    parser.add_argument("--audio", required=True, help="Path to input audio file")
    parser.add_argument("--script", required=True, help="Path to script text file")
    parser.add_argument("--output", required=True, help="Path to output JSON file")
    parser.add_argument("--language", default=None, help="Language code (e.g. kn, en)")
    parser.add_argument("--model", default="base", help="Whisper model size (default: base)")
    args = parser.parse_args()

    # Load script text
    if not os.path.exists(args.script):
        sys.stderr.write(f"Error: Script file not found at {args.script}\n")
        sys.exit(1)

    with open(args.script, "r", encoding="utf-8") as f:
        script_text = f.read().strip()

    if not script_text:
        sys.stderr.write("Error: Script text is empty\n")
        sys.exit(1)

    # Convert language code (e.g. kn-IN -> kn)
    lang = args.language.split("-")[0].lower() if args.language else None

    print(f"Loading stable-ts model '{args.model}'...")
    # Load model
    model = stable_whisper.load_model(args.model)

    print(f"Aligning script text to audio '{args.audio}'...")

    if lang:
        result = model.align(args.audio, script_text, language=lang)
    else:
        print("No language supplied; using auto-detect transcription with word timestamps.")
        result = model.transcribe(args.audio, word_timestamps=True)

    # Extract words structure
    words = []
    for segment in result.segments:
        for w in segment.words:
            word_str = w.word.strip()
            if word_str:
                words.append({
                    "word": word_str,
                    "start": float(w.start),
                    "end": float(w.end)
                })

    # Fallback to transcribe if align yields no words
    if not words:
        print("Warning: model.align yielded no words. Trying model.transcribe as fallback...")
        kwargs = {"word_timestamps": True}
        if lang:
            kwargs["language"] = lang
        result = model.transcribe(args.audio, **kwargs)
        for segment in result.segments:
            for w in segment.words:
                word_str = w.word.strip()
                if word_str:
                    words.append({
                        "word": word_str,
                        "start": float(w.start),
                        "end": float(w.end)
                    })

    # Write output to JSON
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

    print(f"Successfully aligned and saved {len(words)} words to {args.output}")

if __name__ == "__main__":
    main()
