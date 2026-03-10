import subprocess
import json
import sys
import re

def main():
    target_lang = sys.argv[1] if len(sys.argv) > 1 else None
    
    result = subprocess.run(["edge-tts", "--list-voices"], capture_output=True, text=True)
    lines = result.stdout.strip().split('\n')
    
    voices = []
    # Skip headers and separator line
    # Name                               Gender    ContentCategories      VoicePersonalities
    # ---------------------------------  --------  ---------------------  --------------------------------------
    
    for line in lines:
        if not line.strip() or line.startswith("Name") or line.startswith("---"):
            continue
            
        # Use regex to split by 2 or more spaces (columnar format)
        parts = re.split(r'\s{2,}', line.strip())
        if len(parts) >= 2:
            name = parts[0]
            gender = parts[1]
            
            # Simple language filter (e.g. 'zh' matches 'zh-CN-XiaoxiaoNeural')
            if target_lang:
                if target_lang.lower() in name.lower():
                    voices.append({"Name": name, "Gender": gender})
            else:
                voices.append({"Name": name, "Gender": gender})
            
    print(json.dumps(voices, ensure_ascii=False))

if __name__ == "__main__":
    main()
