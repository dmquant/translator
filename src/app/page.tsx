'use client';

import React, { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [status, setStatus] = useState<'idle' | 'processing' | 'selecting_voice' | 'rendering' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<string>('');
  
  // Results from stage 1
  const [videoFile, setVideoFile] = useState('');
  const [jsonFile, setJsonFile] = useState('');
  
  // Voices
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [sampleAudio, setSampleAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Final Output
  const [outputUrl, setOutputUrl] = useState('');

  const languages = [
    { code: 'zh-CN', label: 'Mandarin (Chinese)' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' }
  ];

  const handleUpload = async () => {
    if (!file) return;
    setStatus('processing');
    setLogs('Uploading and running Whisper transcription + translation...\nThis may take a few minutes depending on video length.');
    
    const formData = new FormData();
    formData.append('video', file);
    formData.append('lang', targetLang);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      
      setVideoFile(data.videoFile);
      setJsonFile(data.jsonFile);
      setLogs(prev => prev + '\nTranscription & Translation complete!\nFetching available voices...');
      
      // Fetch voices for this language
      // Extract prefix like 'zh', 'es' for filtering
      const langPrefix = targetLang.split('-')[0];
      const voiceRes = await fetch(`/api/voices?lang=${langPrefix}`);
      const voiceData = await voiceRes.json();
      
      setVoices(voiceData.voices || []);
      if (voiceData.voices && voiceData.voices.length > 0) {
        setSelectedVoice(voiceData.voices[0].Name);
      }
      
      setStatus('selecting_voice');
    } catch (err: any) {
      setStatus('error');
      setLogs(prev => prev + '\nError: ' + err.message);
    }
  };

  const playSample = async () => {
    if (!selectedVoice) return;
    setLogs(prev => prev + `\nGenerating sample for ${selectedVoice}...`);
    
    try {
      const res = await fetch('/api/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: selectedVoice })
      });
      const data = await res.json();
      if (data.url) {
        setSampleAudio(data.url);
        setTimeout(() => {
          audioRef.current?.play();
        }, 100);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRender = async () => {
    setStatus('rendering');
    setLogs(prev => prev + '\nGenerating voiceovers, aligning audio, and rendering via Remotion...');
    
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoFile,
          jsonFile,
          voice: selectedVoice
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rendering failed');
      
      setOutputUrl(data.url);
      setStatus('done');
      setLogs(prev => prev + '\nRender complete! You can now download your video.');
    } catch (err: any) {
      setStatus('error');
      setLogs(prev => prev + '\nError: ' + err.message);
    }
  };

  return (
    <main className="container">
      <header className="header">
        <h1>Cinematic Translator</h1>
        <p>Upload a video, auto-transcribe, translate, and re-dub with professional AI voices.</p>
      </header>

      <div className="card">
        {status === 'idle' || status === 'error' ? (
          <div className="upload-section">
            <div className="form-group">
              <label>1. Select Video</label>
              <input type="file" accept="video/mp4,video/x-m4v,video/*" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="form-group">
              <label>2. Target Language</label>
              <select value={targetLang} onChange={e => setTargetLang(e.target.value)}>
                {languages.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <button className="primary-btn" onClick={handleUpload} disabled={!file}>
              Start Processing
            </button>
          </div>
        ) : null}

        {status === 'selecting_voice' && (
          <div className="voice-section">
            <h2>Select Voiceover</h2>
            <div className="form-group">
              <select size={8} value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="voice-list">
                {voices.map(v => (
                  <option key={v.Name} value={v.Name}>
                    {v.Name} ({v.Gender})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="button-group">
              <button className="secondary-btn" onClick={playSample}>Play Sample</button>
              <button className="primary-btn" onClick={handleRender}>Render Final Video</button>
            </div>

            {sampleAudio && (
              <audio ref={audioRef} src={sampleAudio} controls className="audio-player" />
            )}
          </div>
        )}

        {status === 'done' && outputUrl && (
          <div className="result-section">
            <h2>Success!</h2>
            <video src={outputUrl} controls className="video-player" />
            <div className="button-group" style={{ flexDirection: 'column' }}>
              <a href={outputUrl} download="Translated_Video.mp4" className="primary-btn download-btn">
                Download Video
              </a>
              <a href="http://localhost:3001" target="_blank" rel="noreferrer" className="secondary-btn download-btn">
                Open in Editor (Remotion Studio)
              </a>
              <button className="secondary-btn" onClick={() => { setStatus('idle'); setFile(null); setOutputUrl(''); setLogs(''); }}>
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* Logs Console */}
        {(status !== 'idle' || logs) && (
          <div className="logs-console">
            <div className="loader" style={{ display: ['processing', 'rendering'].includes(status) ? 'block' : 'none' }}></div>
            <pre>{logs}</pre>
          </div>
        )}
      </div>
    </main>
  );
}
