import sys
import json
import subprocess
import os
import math
import traceback

def get_duration(file_path):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except Exception:
        return 0.0

def main():
    try:
        if len(sys.argv) < 5:
            print("ERROR: Usage: python render_video.py <input_video> <translated_json> <voice> <output_video>")
            sys.exit(1)
            
        input_video = sys.argv[1]
        translated_json = sys.argv[2]
        voice = sys.argv[3]
        output_video = sys.argv[4]
        
        with open(translated_json, "r", encoding="utf-8") as f:
            segments = json.load(f)
            
        remotion_dir = "remotion"
        public_dir = os.path.join(remotion_dir, "public")
        vos_dir = os.path.join(public_dir, "vos")
        vos_fixed_dir = os.path.join(public_dir, "vos_fixed")
        os.makedirs(vos_dir, exist_ok=True)
        os.makedirs(vos_fixed_dir, exist_ok=True)
        
        total = len(segments)
        print(f"PROGRESS: Generating {total} voiceover segments...")
        sys.stdout.flush()

        for i, seg in enumerate(segments):
            text = seg["text"]
            filename = os.path.join(vos_dir, f"s{i}.mp3")
            print(f"PROGRESS: TTS generation {i+1}/{total}...")
            sys.stdout.flush()
            res = subprocess.run(["edge-tts", "--voice", voice, "--text", text, "--write-media", filename], capture_output=True, text=True)
            if res.returncode != 0:
                print(f"ERROR: edge-tts failed for segment {i}")
                sys.exit(1)
            
        print("PROGRESS: Optimizing audio alignment and speed...")
        sys.stdout.flush()
        input_video_duration = get_duration(input_video)

        for i in range(len(segments)):
            input_file = os.path.join(vos_dir, f"s{i}.mp3")
            output_file = os.path.join(vos_fixed_dir, f"s{i}.mp3")
            
            start_time = segments[i]["start"]
            end_time = segments[i+1]["start"] if i < len(segments) - 1 else input_video_duration
            available_duration = max(0.1, end_time - start_time)
            
            current_duration = get_duration(input_file)
            if current_duration > available_duration:
                speed = current_duration / available_duration
                filters = []
                temp_speed = speed
                while temp_speed > 2.0:
                    filters.append("atempo=2.0")
                    temp_speed /= 2.0
                if temp_speed > 1.0:
                    filters.append(f"atempo={temp_speed:.2f}")
                filter_str = ",".join(filters)
                subprocess.run(["ffmpeg", "-y", "-i", input_file, "-filter:a", filter_str, output_file], capture_output=True)
            else:
                subprocess.run(["cp", input_file, output_file])
                
        # 3. Remotion Config
        video_public_path = os.path.join(public_dir, "original.mp4")
        subprocess.run(["cp", input_video, video_public_path], check=True)
        
        with open(os.path.join(remotion_dir, "src", "segments.json"), "w", encoding="utf-8") as f:
            json.dump(segments, f, ensure_ascii=False, indent=2)
            
        fps = 60
        duration_frames = math.ceil(input_video_duration * fps)
        config_data = {
            "durationInFrames": duration_frames, "fps": fps,
            "videoSrc": "original.mp4", "videoDuration": input_video_duration
        }
        with open(os.path.join(remotion_dir, "src", "config.json"), "w", encoding="utf-8") as f:
            json.dump(config_data, f, ensure_ascii=False, indent=2)
            
        print("PROGRESS: Starting Remotion render engine (60fps)...")
        sys.stdout.flush()
        abs_output = os.path.abspath(output_video)
        
        # We can use Popen to stream Remotion's own progress output if we wanted more detail
        result = subprocess.run(["npx", "remotion", "render", "Main", abs_output, "-y"], cwd=remotion_dir, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("DONE_VIDEO_FILE:" + abs_output)
            sys.stdout.flush()
        else:
            print(f"ERROR: Remotion render failed: {result.stderr}")
            sys.stdout.flush()
            sys.exit(1)

    except Exception as e:
        print(f"ERROR: {e}")
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()
