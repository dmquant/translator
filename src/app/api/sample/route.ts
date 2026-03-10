import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

export async function POST(req: NextRequest) {
  try {
    const { voice, text } = await req.json();
    const sampleFile = `sample_${Date.now()}.mp3`;
    const outputPath = path.join(process.cwd(), 'public', 'samples', sampleFile);
    
    // Ensure dir exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    return new Promise<NextResponse>((resolve) => {
      const pyProcess = spawn('edge-tts', [
        '--voice', voice, 
        '--text', text || "Hello, this is a sample voice. 你好，这是一个声音样本。", 
        '--write-media', outputPath
      ]);
      
      pyProcess.on('close', (code) => {
        if (code === 0) {
          resolve(NextResponse.json({ url: '/samples/' + sampleFile }));
        } else {
          resolve(NextResponse.json({ error: 'Sample generation failed' }, { status: 500 }));
        }
      });
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
