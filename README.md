# Cinematic Translator | 影视翻译家

An automated video globalization tool that transcribes, translates, and re-dubs videos using AI.
一个自动化的视频全球化工具，利用 AI 实现视频的转录、翻译和自动配音。

---

## 🌟 Features | 功能特点

- **Auto Transcription**: Uses OpenAI Whisper to detect and transcribe original audio with precise timestamps.
- **智能转录**：使用 OpenAI Whisper 自动检测并转录原始音频，带有精确的时间戳。
- **Multilingual Translation**: Seamlessly translates content into Chinese, Spanish, French, and more.
- **多语言翻译**：无缝将内容翻译为中文、西班牙语、法语等。
- **Professional Dubbing**: Integrated with `edge-tts` for high-quality, natural AI voices.
- **专业配音**：集成 `edge-tts`，提供高质量、自然的 AI 语音。
- **Auto-Sync & Speed Correction**: Automatically adjusts voiceover speed to match video timing and prevent overlaps.
- **自动同步与语速校正**：自动调整配音语速以匹配视频时长，防止语音重叠。
- **Dynamic Captions**: Renders cinematic captions directly into the final video.
- **动态字幕**：将电影级字幕直接渲染到最终视频中。

---

## 🛠️ Tech Stack | 技术栈

- **Frontend**: Next.js (App Router), TypeScript, Vanilla CSS
- **Backend**: Next.js API Routes, Python Scripts
- **Transcription**: OpenAI Whisper
- **Translation**: Deep-Translator (Google)
- **Voiceover**: Microsoft Edge TTS
- **Video Rendering**: Remotion, FFmpeg

---

## 🚀 Getting Started | 快速开始

### 1. Prerequisites | 前提条件

Ensure you have the following installed:
确保您已安装以下工具：

- **Node.js** (v18 or later)
- **Python 3.9+**
- **FFmpeg** (Required for audio/video processing)
- **Pip packages**:
  ```bash
  pip install openai-whisper edge-tts deep-translator
  ```

### 2. Installation | 安装步骤

1. **Clone the repository | 克隆仓库**:
   ```bash
   git clone <your-repo-url>
   cd cinematic/translator-app
   ```

2. **Install Node dependencies | 安装 Node 依赖**:
   ```bash
   npm install
   cd remotion && npm install && cd ..
   ```

3. **Start the development server | 启动开发服务器**:
   ```bash
   npm run dev
   ```

4. **Access the App | 访问应用**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 How to Use | 使用指南

1. **Upload Video | 上传视频**: Select an MP4 or MOV file from your computer.
2. **Select Language | 选择语言**: Choose your desired target language (e.g., Mandarin Chinese).
3. **Wait for Analysis | 等待分析**: The system will run Whisper to transcribe and translate.
4. **Choose a Voice | 选择配音**: 
   - Browse the list of available AI voices.
   - Click **"Play Sample"** to hear a preview of the voice.
5. **Render | 渲染**: Click **"Render Final Video"**. The system will generate voiceovers and composite the final video.
6. **Download | 下载**: Once complete, watch the preview and click **"Download Video"**.

---

## 📂 Project Structure | 项目结构

- `/src/app`: Next.js frontend and API routes.
- `/scripts`: Core Python logic for Whisper, Translation, and Audio processing.
- `/remotion`: The video composition engine and assets.
- `/public/uploads`: Temporary storage for uploaded videos.
- `/public/rendered`: Final processed video outputs.

---

## ⚠️ Notes | 注意事项

- **First Run**: The first transcription might take longer as Whisper downloads its model (default: `base`).
- **首次运行**：第一次转录可能需要较长时间，因为 Whisper 需要下载模型（默认为 `base`）。
- **Performance**: Rendering speed depends on your CPU/GPU and the length of the video.
- **性能**：渲染速度取决于您的 CPU/GPU 以及视频长度。

---

## 📜 License | 许可证

MIT
