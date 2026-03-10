'use client';

import React, { useState, useRef } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [engine, setEngine] = useState('google');
  const [status, setStatus] = useState<'idle' | 'processing' | 'selecting_voice' | 'rendering' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<string>('');
  
  const [videoFile, setVideoFile] = useState('');
  const [jsonFile, setJsonFile] = useState('');
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [sampleAudio, setSampleAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [outputUrl, setOutputUrl] = useState('');

  const languages = [
    { code: 'zh-CN', label: 'Mandarin (Chinese)' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' }
  ];

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
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoFile, jsonFile, voice: selectedVoice })
      });
      if (!res.ok) throw new Error('Render request failed');
      
      const fullOutput = await readStream(res, (data) => {
        setLogs(prev => prev + data);
      });

      const videoMatch = fullOutput.match(/DONE_VIDEO_FILE:(.*)/);
      if (videoMatch) {
        // Derive public URL from absolute path
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

  const playSample = async () => {
    if (!selectedVoice) return;
    try {
      const res = await fetch('/api/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: selectedVoice })
      });
      const data = await res.json();
      if (data.url) {
        setSampleAudio(data.url);
        setTimeout(() => audioRef.current?.play(), 100);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <main className="container">
      <header className="header">
        <h1>Cinematic Translator</h1>
        <p>AI-Powered Video Dubbing & Globalization</p>
      </header>

      <div className="card">
        {(status === 'idle' || status === 'error') && (
          <div className="upload-section">
            <div className="form-group">
              <label>1. Select Video</label>
              <input type="file" accept="video/*" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="form-group">
              <label>2. Target Language</label>
              <select value={targetLang} onChange={e => setTargetLang(e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>3. Translation Engine</label>
              <select value={engine} onChange={e => setEngine(e.target.value)}>
                <option value="google">Google Translate</option>
                <option value="gemini">Gemini 3.1 Flash Lite</option>
              </select>
            </div>
            <button className="primary-btn" onClick={handleUpload} disabled={!file}>Start Processing</button>
          </div>
        )}

        {status === 'selecting_voice' && (
          <div className="voice-section">
            <h2>Select Voiceover</h2>
            <div className="form-group">
              <select size={8} value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="voice-list">
                {voices.map(v => <option key={v.Name} value={v.Name}>{v.Name} ({v.Gender})</option>)}
              </select>
            </div>
            <div className="button-group">
              <button className="secondary-btn" onClick={playSample}>Play Sample</button>
              <button className="primary-btn" onClick={handleRender}>Render Final Video</button>
            </div>
            {sampleAudio && <audio ref={audioRef} src={sampleAudio} controls className="audio-player" />}
          </div>
        )}

        {status === 'done' && outputUrl && (
          <div className="result-section">
            <h2>Success!</h2>
            <video src={outputUrl} controls className="video-player" />
            <div className="button-group" style={{ flexDirection: 'column' }}>
              <a href={outputUrl} download="Translated_Video.mp4" className="primary-btn download-btn">Download Video</a>
              <a href="http://localhost:3001" target="_blank" rel="noreferrer" className="secondary-btn download-btn">Open in Editor (Remotion Studio)</a>
              <button className="secondary-btn" onClick={() => { setStatus('idle'); setFile(null); setOutputUrl(''); setLogs(''); }}>Start Over</button>
            </div>
          </div>
        )}

        {(status !== 'idle' || logs) && (
          <div className="logs-console">
            {['processing', 'rendering'].includes(status) && <div className="loader"></div>}
            <pre>{logs}</pre>
          </div>
        )}
      </div>
    </main>
  );
}
