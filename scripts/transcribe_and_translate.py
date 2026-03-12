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

def resegment_to_sentences(whisper_data):
    """
    Groups whisper words into complete sentences based on punctuation.
    """
    all_words = []
    for seg in whisper_data.get('segments', []):
        if 'words' in seg:
            all_words.extend(seg['words'])
        else:
            # Fallback: approximation if word_timestamps failed
            words = seg['text'].strip().split()
            if not words: continue
            duration = seg['end'] - seg['start']
            word_dur = duration / len(words)
            for i, w in enumerate(words):
                all_words.append({
                    "word": w,
                    "start": seg['start'] + i * word_dur,
                    "end": seg['start'] + (i + 1) * word_dur
                })
    
    if not all_words: return []
    
    new_segments = []
    curr_words = []
    
    # Sentence ending patterns
    sentence_ends = re.compile(r'.*[.!?;。！？；]$')
    
    for i, w_obj in enumerate(all_words):
        curr_words.append(w_obj)
        word_text = w_obj['word'].strip()
        
        # Condition to close a segment: 
        # 1. Punctuation at end of word
        # 2. Or it's been a long time (max 12 seconds per segment)
        # 3. Or it's the very last word
        duration_so_far = w_obj['end'] - curr_words[0]['start']
        
        if sentence_ends.match(word_text) or duration_so_far > 12.0 or i == len(all_words) - 1:
            start_t = curr_words[0]['start']
            end_t = curr_words[-1]['end']
            text = " ".join([x['word'].strip() for x in curr_words])
            
            # Clean up double spaces if any
            text = re.sub(r'\s+', ' ', text)
            
            if text:
                new_segments.append({"start": start_t, "end": end_t, "text": text})
            curr_words = []
            
    return new_segments

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
1. Keep the SRT format EXACTLY as provided (index, timestamps).
2. ONLY return the translated SRT content. No explanations, no preamble.
3. Preserve technical terms correctly.
4. Ensure each segment is a natural, readable sentence in {target_lang}.

SRT CONTENT:
{srt_content}
"""

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-3.1-flash-lite-preview', 
                contents=prompt
            )
            full_text = ""
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.text: full_text += part.text
            if not full_text: raise Exception("Empty response")
            return full_text.strip()
        except Exception as e:
            if "503" in str(e) and attempt < max_retries - 1:
                wait_time = (attempt + 1) * 5
                print(f"LOG: Gemini busy (503), retrying in {wait_time}s...\n")
                time.sleep(wait_time)
                continue
            print(f"LOG: Gemini translation failed: {e}\n")
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
        
        print(f"DATA:PROGRESS: Starting Whisper transcription (with word timestamps) for {base_name}...\n")
        sys.stdout.flush()
        
        try:
            # Added --word_timestamps True for better re-segmentation
            subprocess.run(["whisper", video_file, "--model", "base", "--word_timestamps", "True", "--output_format", "json", "--output_dir", output_dir], check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"ERROR: Whisper failed: {e.stderr}")
            sys.exit(1)
        
        whisper_json = os.path.join(output_dir, name_no_ext + ".json")
        with open(whisper_json, "r", encoding="utf-8") as f:
            whisper_data = json.load(f)
            
        # Optimization: Resegment into sentences before translation
        segments = resegment_to_sentences(whisper_data)
        if not segments:
            print("ERROR: No speech segments detected")
            sys.exit(1)

        print(f"DATA:PROGRESS: Grouped into {len(segments)} logical sentences. Translating using {engine}...\n")
        sys.stdout.flush()

        result_segments = []

        if engine == 'gemini':
            gemini_api_key = os.environ.get("GEMINI_API_KEY")
            if not gemini_api_key:
                print("ERROR: GEMINI_API_KEY not set")
                sys.exit(1)
            
            srt_input = segments_to_srt(segments)
            translated_srt = translate_srt_with_gemini(srt_input, target_lang, gemini_api_key)
            
            if translated_srt:
                try:
                    translated_srt = re.sub(r'^```(srt)?\n', '', translated_srt)
                    translated_srt = re.sub(r'\n```$', '', translated_srt)
                    parsed_segments = parse_srt(translated_srt)
                    
                    for i, orig in enumerate(segments):
                        text = orig['text']
                        if i < len(parsed_segments):
                            text = parsed_segments[i]['text']
                        result_segments.append({
                            "start": orig['start'], "end": orig['end'],
                            "original_text": orig['text'], "text": text
                        })
                except Exception as e:
                    print(f"ERROR: SRT Parsing failed: {e}")
                    sys.exit(1)
            else:
                print("ERROR: Gemini translation failed")
                sys.exit(1)
        else:
            translator = GoogleTranslator(source='auto', target=target_lang)
            for i, seg in enumerate(segments):
                print(f"DATA:PROGRESS: Translating sentence {i+1}/{len(segments)}...\n")
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
