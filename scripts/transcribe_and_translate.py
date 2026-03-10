import sys
import json
import subprocess
import os
import traceback
from deep_translator import GoogleTranslator

def main():
    try:
        if len(sys.argv) < 3:
            print("ERROR: Usage: python transcribe_and_translate.py <video_file> <target_lang>")
            sys.exit(1)
            
        video_file = sys.argv[1]
        target_lang = sys.argv[2]
        
        if not os.path.exists(video_file):
            print(f"ERROR: Video file not found at {video_file}")
            sys.exit(1)

        print(f"Running Whisper on {video_file}...")
        try:
            subprocess.run(["whisper", video_file, "--model", "base", "--output_format", "json", "--output_dir", "."], check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"ERROR: Whisper failed: {e.stderr}")
            sys.exit(1)
        
        base_name = os.path.basename(video_file)
        json_file = os.path.splitext(base_name)[0] + ".json"
        
        if not os.path.exists(json_file):
            print(f"ERROR: Whisper output {json_file} not found")
            sys.exit(1)
            
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        segments = data.get("segments", [])
        if not segments:
            print("ERROR: No speech segments detected in video")
            sys.exit(1)

        result_segments = []
        print(f"Translating {len(segments)} segments to {target_lang}...")
        
        try:
            translator = GoogleTranslator(source='auto', target=target_lang)
        except Exception as e:
            print(f"ERROR: Failed to initialize translator: {e}")
            sys.exit(1)
        
        for i, seg in enumerate(segments):
            original_text = seg.get("text", "").strip()
            start = seg.get("start", 0)
            end = seg.get("end", 0)
            
            if not original_text:
                continue
                
            try:
                translated_text = translator.translate(original_text)
                if not translated_text:
                    raise Exception("Empty translation result")
            except Exception as e:
                print(f"WARNING: Translation failed for segment {i}: {e}")
                # For critical errors, we could sys.exit, but here we fallback to original
                translated_text = original_text 
                
            result_segments.append({
                "start": start,
                "end": end,
                "original_text": original_text,
                "text": translated_text
            })
            
        output_json = os.path.splitext(base_name)[0] + f"_translated_{target_lang}.json"
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result_segments, f, ensure_ascii=False, indent=2)
            
        print("DONE_JSON_FILE:" + output_json)

    except Exception as e:
        print(f"ERROR: Unexpected script failure: {e}")
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
