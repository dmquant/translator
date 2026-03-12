import sys
import json
import subprocess
import os
import traceback
import warnings
import time
import re
from deep_translator import GoogleTranslator

# Suppress annoying FutureWarnings about python version
warnings.filterwarnings("ignore", category=FutureWarning)

from google import genai

def segments_to_srt(segments):
    srt = ""
    for i, seg in enumerate(segments):
        start = seg['start']
        end = seg['end']
        text = seg['text'].strip()
        
        def format_time(seconds):
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds % 1) * 1000)
            return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"
        
        srt += f"{i+1}\n"
        srt += f"{format_time(start)} --> {format_time(end)}\n"
        srt += f"{text}\n\n"
    return srt

def parse_srt(srt_text):
    # Very robust regex to find SRT blocks
    pattern = re.compile(r'(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n(.*?)(?=\n\n\d+|\Z)', re.DOTALL)
    matches = pattern.findall(srt_text)
    
    segments = []
    for m in matches:
        index, start_str, end_match, text = m
        
        def srt_time_to_seconds(s):
            h, m, s_part = s.split(':')
            sec, ms = s_part.split(',')
            return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000.0
        
        segments.append({
            "start": srt_time_to_seconds(start_str),
            "end": srt_time_to_seconds(end_match),
            "text": text.strip().replace('\n', ' ')
        })
    return segments

def translate_srt_with_gemini(srt_content, target_lang, api_key):
    client = genai.Client(api_key=api_key)
    max_retries = 3
    
    prompt = f"""You are a professional video translator. 
Translate the following SRT subtitles into {target_lang}.
STRICT RULES:
1. Keep the SRT format EXACTLY as provided (index, timestamps, and text structure).
2. ONLY return the translated SRT content. No explanations, no preamble.
3. Preserve technical terms correctly.
4. Ensure the translation is natural and fits the context of the entire video.

SRT CONTENT:
{srt_content}
"""

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-3.1-flash-lite-preview', 
                contents=prompt
            )
            # Safely extract text parts only to avoid SDK warnings about thought_signature
            full_text = ""
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.text:
                        full_text += part.text
            
            if not full_text:
                raise Exception("No text returned in response")
                
            return full_text.strip()
        except Exception as e:
            if "503" in str(e) and attempt < max_retries - 1:
                wait_time = (attempt + 1) * 5
                print(f"LOG: Gemini busy (503), retrying SRT translation in {wait_time}s...\n")
                time.sleep(wait_time)
                continue
            print(f"LOG: Gemini SRT translation failed: {e}\n")
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
            # Whisper execution
            subprocess.run(["whisper", video_file, "--model", "base", "--output_format", "json", "--output_dir", output_dir], check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            # Handle the "no text to recognize" or other errors
            if "no text to recognize" in e.stderr.lower() or "no text to recognize" in e.stdout.lower():
                print("ERROR: No speech detected in this video file.")
            else:
                print(f"ERROR: Whisper failed: {e.stderr}")
            sys.exit(1)
        
        whisper_json = os.path.join(output_dir, name_no_ext + ".json")
        if not os.path.exists(whisper_json):
            print(f"ERROR: Whisper output {whisper_json} not found")
            sys.exit(1)
            
        with open(whisper_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        segments = data.get("segments", [])
        if not segments:
            print("ERROR: No speech segments were extracted from the video.")
            sys.exit(1)

        print(f"DATA:PROGRESS: Transcribed {len(segments)} segments. Translating using {engine}...\n")
        sys.stdout.flush()

        result_segments = []

        if engine == 'gemini':
            gemini_api_key = os.environ.get("GEMINI_API_KEY")
            if not gemini_api_key:
                print("ERROR: GEMINI_API_KEY not set")
                sys.exit(1)
            
            # Context-aware SRT translation
            srt_input = segments_to_srt(segments)
            print("DATA:PROGRESS: Sending entire SRT to Gemini for context-aware translation...\n")
            sys.stdout.flush()
            
            translated_srt = translate_srt_with_gemini(srt_input, target_lang, gemini_api_key)
            
            if translated_srt:
                try:
                    # Clean up markdown code blocks if Gemini included them
                    translated_srt = re.sub(r'^```srt\n', '', translated_srt)
                    translated_srt = re.sub(r'^```\n', '', translated_srt)
                    translated_srt = re.sub(r'\n```$', '', translated_srt)
                    
                    parsed_segments = parse_srt(translated_srt)
                    if len(parsed_segments) > 0:
                        # We try to align indices if lengths mismatch, but usually they match
                        # For safety, if they mismatch, we fallback to original timing
                        for i, orig in enumerate(segments):
                            text = orig['text']
                            if i < len(parsed_segments):
                                text = parsed_segments[i]['text']
                            
                            result_segments.append({
                                "start": orig['start'],
                                "end": orig['end'],
                                "original_text": orig['text'],
                                "text": text
                            })
                    else:
                        raise Exception("Failed to parse translated SRT")
                except Exception as e:
                    print(f"LOG: SRT Parsing failed: {e}. Falling back to segment-by-segment.\n")
                    # Fallback logic would go here if needed, or just fail
                    sys.exit(1)
            else:
                print("ERROR: Gemini failed to translate SRT content.")
                sys.exit(1)
        else:
            # Standard Google segment-by-segment (for legacy/fallback)
            translator = GoogleTranslator(source='auto', target=target_lang)
            for i, seg in enumerate(segments):
                print(f"DATA:PROGRESS: Translating segment {i+1}/{len(segments)}...\n")
                sys.stdout.flush()
                try:
                    translated = translator.translate(seg['text'])
                    result_segments.append({
                        "start": seg['start'], "end": seg['end'],
                        "original_text": seg['text'], "text": translated
                    })
                except:
                    result_segments.append({
                        "start": seg['start'], "end": seg['end'],
                        "original_text": seg['text'], "text": seg['text']
                    })

        output_json = os.path.abspath(os.path.join(output_dir, f"{name_no_ext}_translated_{target_lang}.json"))
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(result_segments, f, ensure_ascii=False, indent=2)
            
        print("DATA:DONE_VIDEO_FILE:" + video_file + "\n")
        print("DATA:DONE_JSON_FILE:" + output_json + "\n")
        sys.stdout.flush()

    except Exception as e:
        print(f"ERROR: {e}")
        traceback.print_exc()
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
