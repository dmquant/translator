import sys
import json
import subprocess
import os
import traceback
from deep_translator import GoogleTranslator
import google.generativeai as genai

def translate_with_gemini(text, target_lang, api_key):
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-3.1-flash-lite-preview') 
        prompt = f"Translate the following technical text into {target_lang}. Return ONLY the translated text, no explanation.\n\nText: {text}"
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"LOG: Gemini translation failed: {e}")
        return None

def main():
    try:
        if len(sys.argv) < 4:
            print("ERROR: Usage: python transcribe_and_translate.py <video_file> <target_lang> <engine>")
            sys.exit(1)
            
        video_file = os.path.abspath(sys.argv[1])
        target_lang = sys.argv[2]
        engine = sys.argv[3]
        
        if not os.path.exists(video_file):
            print(f"ERROR: Video file not found at {video_file}")
            sys.exit(1)

        output_dir = "working_data"
        os.makedirs(output_dir, exist_ok=True)
        
        base_name = os.path.basename(video_file)
        name_no_ext = os.path.splitext(base_name)[0]
        
        print(f"DATA:PROGRESS: Starting Whisper transcription for {base_name}...\n")
        sys.stdout.flush()
        
        try:
            subprocess.run(["whisper", video_file, "--model", "base", "--output_format", "json", "--output_dir", output_dir], check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"ERROR: Whisper failed: {e.stderr}")
            sys.exit(1)
        
        whisper_json = os.path.join(output_dir, name_no_ext + ".json")
        if not os.path.exists(whisper_json):
            print(f"ERROR: Whisper output {whisper_json} not found")
            sys.exit(1)
            
        with open(whisper_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        segments = data.get("segments", [])
        total = len(segments)
        if not segments:
            print("ERROR: No speech segments detected")
            sys.exit(1)

        print(f"DATA:PROGRESS: Transcribed {total} segments. Starting {engine} translation...\n")
        sys.stdout.flush()

        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if engine == 'gemini' and not gemini_api_key:
            print("ERROR: GEMINI_API_KEY not set")
            sys.exit(1)

        translator = None
        if engine == 'google':
            translator = GoogleTranslator(source='auto', target=target_lang)
        
        result_segments = []
        for i, seg in enumerate(segments):
            original_text = seg.get("text", "").strip()
            start = seg.get("start", 0)
            end = seg.get("end", 0)
            if not original_text: continue
            
            print(f"DATA:PROGRESS: Translating segment {i+1}/{total}...\n")
            sys.stdout.flush()
            
            translated_text = None
            try:
                if engine == 'gemini':
                    translated_text = translate_with_gemini(original_text, target_lang, gemini_api_key)
                else:
                    translated_text = translator.translate(original_text)
                
                if not translated_text: raise Exception("Empty translation")
            except Exception as e:
                print(f"LOG: Segment {i} failed: {e}\n")
                translated_text = original_text
                
            result_segments.append({
                "start": start, "end": end,
                "original_text": original_text, "text": translated_text
            })
            
        output_json = os.path.abspath(os.path.join(output_dir, f"{name_no_ext}_translated_{target_lang}.json"))
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result_segments, f, ensure_ascii=False, indent=2)
            
        print("DATA:DONE_VIDEO_FILE:" + video_file + "\n")
        print("DATA:DONE_JSON_FILE:" + output_json + "\n")
        sys.stdout.flush()

    except Exception as e:
        print(f"ERROR: {e}")
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
