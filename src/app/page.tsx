'use client';

import React, { useState, useRef, useCallback } from 'react';

const languages = [
  { code: 'zh-CN', label: 'Mandarin Chinese', flag: '🇨🇳' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷' },
];

const engines = [
  { value: 'google', label: 'Google Translate', desc: 'Fast & reliable' },
  { value: 'gemini', label: 'Gemini Flash', desc: 'AI-powered quality' },
];

type Status = 'idle' | 'processing' | 'selecting_voice' | 'rendering' | 'done' | 'error';

const steps = [
  { key: 'upload', label: 'Upload' },
  { key: 'transcribe', label: 'Transcribe & Translate' },
  { key: 'voice', label: 'Select Voice' },
  { key: 'render', label: 'Render' },
  { key: 'done', label: 'Done' },
];

function getStepIndex(status: Status): number {
  switch (status) {
    case 'idle': case 'error': return 0;
    case 'processing': return 1;
    case 'selecting_voice': return 2;
    case 'rendering': return 3;
    case 'done': return 4;
    default: return 0;
  }
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [engine, setEngine] = useState('google');
  const [status, setStatus] = useState<Status>('idle');
  const [logs, setLogs] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);

  const [videoFile, setVideoFile] = useState('');
  const [jsonFile, setJsonFile] = useState('');
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [sampleAudio, setSampleAudio] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [outputUrl, setOutputUrl] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const currentStep = getStepIndex(status);

  const readStream = async (response: Response, onData: (data: string) => void) => {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let fullOutput = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const parts = chunk.split(/(DATA:|LOG:|ERROR:|CLOSE:)/);
      let currentPrefix = '';
      for (let part of parts) {
        if (['DATA:', 'LOG:', 'ERROR:', 'CLOSE:'].includes(part)) {
          currentPrefix = part;
          continue;
        }
        if (!part) continue;
        if (currentPrefix === 'DATA:') {
          onData(part);
          fullOutput += part;
        } else if (currentPrefix === 'LOG:') {
          onData(part);
        } else if (currentPrefix === 'ERROR:') {
          throw new Error(part);
        }
      }
    }
    return fullOutput;
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('processing');
    setLogs('');

    const formData = new FormData();
    formData.append('video', file);
    formData.append('lang', targetLang);
    formData.append('engine', engine);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');

      const fullOutput = await readStream(res, (data) => {
        setLogs(prev => prev + data);
      });

      const jsonMatch = fullOutput.match(/DONE_JSON_FILE:(.*)/);
      const videoMatch = fullOutput.match(/DONE_VIDEO_FILE:(.*)/);

      if (jsonMatch && videoMatch) {
        setJsonFile(jsonMatch[1].trim());
        setVideoFile(videoMatch[1].trim());
      } else {
        throw new Error('Failed to capture processed file paths');
      }

      const langPrefix = targetLang.split('-')[0];
      const voiceRes = await fetch(`/api/voices?lang=${langPrefix}`);
      const voiceData = await voiceRes.json();
      setVoices(voiceData.voices || []);
      if (voiceData.voices?.length > 0) setSelectedVoice(voiceData.voices[0].Name);

      setStatus('selecting_voice');
    } catch (err: any) {
      setStatus('error');
      setLogs(prev => prev + '\nError: ' + err.message);
    }
  };

  const handleRender = async () => {
    setStatus('rendering');
    setLogs('');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoFile, jsonFile, voice: selectedVoice }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('Render request failed');

      const fullOutput = await readStream(res, (data) => {
        setLogs(prev => prev + data);
      });

      const videoMatch = fullOutput.match(/DONE_VIDEO_FILE:(.*)/);
      if (videoMatch) {
        const absPath = videoMatch[1].trim();
        const filename = absPath.split('/').pop();
        setOutputUrl('/rendered/' + filename);
        setStatus('done');
      } else {
        throw new Error('Could not find rendered video path');
      }
    } catch (err: any) {
      setStatus('error');
      setLogs(prev => prev + '\nError: ' + err.message);
    }
  };

  const playSample = async (voiceName: string) => {
    setPlayingVoice(voiceName);
    try {
      const res = await fetch('/api/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceName }),
      });
      const data = await res.json();
      if (data.url) {
        setSampleAudio(data.url);
        setTimeout(() => {
          audioRef.current?.play();
          if (audioRef.current) {
            audioRef.current.onended = () => setPlayingVoice(null);
          }
        }, 100);
      }
    } catch (e) {
      console.error(e);
      setPlayingVoice(null);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type.startsWith('video/')) setFile(droppedFile);
  }, []);

  const handleStartOver = () => {
    setStatus('idle');
    setFile(null);
    setOutputUrl('');
    setLogs('');
    setVoices([]);
    setSelectedVoice('');
    setSampleAudio(null);
  };

  return (
    <main className="container">
      {/* Header */}
      <header className="header">
        <div className="logo-icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="url(#grad)" />
            <path d="M12 14h16M12 20h10M12 26h14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M28 22l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <defs><linearGradient id="grad" x1="0" y1="0" x2="40" y2="40"><stop stopColor="#3b82f6"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs>
          </svg>
        </div>
        <h1>Cinematic Translator</h1>
        <p className="subtitle">AI-Powered Video Dubbing & Globalization</p>
      </header>

      {/* Step Progress */}
      {status !== 'idle' && status !== 'error' && (
        <div className="steps-bar">
          {steps.map((step, i) => (
            <div key={step.key} className={`step ${i < currentStep ? 'completed' : ''} ${i === currentStep ? 'active' : ''}`}>
              <div className="step-dot">
                {i < currentStep ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className="step-label">{step.label}</span>
              {i < steps.length - 1 && <div className="step-line" />}
            </div>
          ))}
        </div>
      )}

      {/* Upload Section */}
      {(status === 'idle' || status === 'error') && (
        <div className="card">
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={e => setFile(e.target.files?.[0] || null)}
              hidden
            />
            {file ? (
              <div className="file-info">
                <div className="file-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,8 16,12 10,16" fill="#3b82f6" stroke="none"/></svg>
                </div>
                <div>
                  <div className="file-name">{file.name}</div>
                  <div className="file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              </div>
            ) : (
              <div className="drop-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="drop-text">Drop your video here or click to browse</p>
                <p className="drop-hint">Supports MP4, MOV, AVI, MKV</p>
              </div>
            )}
          </div>

          <div className="settings-grid">
            <div className="setting-card">
              <label className="setting-label">Target Language</label>
              <div className="lang-grid">
                {languages.map(l => (
                  <button
                    key={l.code}
                    className={`lang-chip ${targetLang === l.code ? 'selected' : ''}`}
                    onClick={() => setTargetLang(l.code)}
                  >
                    <span className="lang-flag">{l.flag}</span>
                    <span className="lang-name">{l.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-card">
              <label className="setting-label">Translation Engine</label>
              <div className="engine-options">
                {engines.map(eng => (
                  <button
                    key={eng.value}
                    className={`engine-chip ${engine === eng.value ? 'selected' : ''}`}
                    onClick={() => setEngine(eng.value)}
                  >
                    <span className="engine-name">{eng.label}</span>
                    <span className="engine-desc">{eng.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {status === 'error' && logs && (
            <div className="error-banner">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5"/><path d="M8 5v3M8 10.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span>An error occurred. Check the log below or try again.</span>
            </div>
          )}

          <button
            className="primary-btn start-btn"
            onClick={handleUpload}
            disabled={!file}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none"/></svg>
            <span>{file ? 'Start Processing' : 'Select a video to begin'}</span>
          </button>
        </div>
      )}

      {/* Voice Selection */}
      {status === 'selecting_voice' && (
        <div className="card">
          <h2 className="section-title">Choose a Voice</h2>
          <p className="section-desc">Select a voice for the dubbed audio track</p>
          <div className="voice-grid">
            {voices.map(v => (
              <button
                key={v.Name}
                className={`voice-card ${selectedVoice === v.Name ? 'selected' : ''}`}
                onClick={() => setSelectedVoice(v.Name)}
              >
                <div className="voice-info">
                  <span className="voice-name">{v.Name.split('-').slice(-1)[0].replace(/Neural$/, '')}</span>
                  <span className="voice-meta">{v.Gender}</span>
                </div>
                <button
                  className="play-btn"
                  onClick={e => { e.stopPropagation(); playSample(v.Name); }}
                  disabled={playingVoice === v.Name}
                >
                  {playingVoice === v.Name ? (
                    <div className="mini-loader" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  )}
                </button>
              </button>
            ))}
          </div>
          {sampleAudio && <audio ref={audioRef} src={sampleAudio} />}
          <button className="primary-btn start-btn" onClick={handleRender}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/></svg>
            <span>Render Final Video</span>
          </button>
        </div>
      )}

      {/* Done */}
      {status === 'done' && outputUrl && (
        <div className="card result-card">
          <div className="success-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981"/><path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Video Ready</span>
          </div>
          <video src={outputUrl} controls className="video-player" />
          <div className="result-actions">
            <a href={outputUrl} download="Translated_Video.mp4" className="primary-btn download-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span>Download Video</span>
            </a>
            <button className="secondary-btn" onClick={handleStartOver}>Start Over</button>
          </div>
        </div>
      )}

      {/* Logs Terminal */}
      {(status !== 'idle' || logs) && logs && (
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <span className="terminal-title">Console Output</span>
          </div>
          <div className="terminal-body">
            {['processing', 'rendering'].includes(status) && <div className="loader" />}
            <pre>{logs}</pre>
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </main>
  );
}
