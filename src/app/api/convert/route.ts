import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { videoFile, jsonFile, voice } = await req.json();

    if (!videoFile || !jsonFile || !voice) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const outputFile = path.join(process.cwd(), 'public', 'rendered', `output_${Date.now()}.mp4`);
    const outputDir = path.dirname(outputFile);
    
    const fs = require('fs').promises;
    await fs.mkdir(outputDir, { recursive: true });

    const scriptPath = path.join(process.cwd(), 'scripts', 'render_video.py');
    
    return new Promise<NextResponse>((resolve) => {
      const pyProcess = spawn('python3', [scriptPath, videoFile, jsonFile, voice, outputFile]);
      
      let output = '';
      let error = '';
      
      pyProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(data.toString());
      });

      pyProcess.stderr.on('data', (data) => {
        error += data.toString();
        console.error(data.toString());
      });

      pyProcess.on('close', (code) => {
        if (code !== 0) {
          const errMsg = output.match(/ERROR: (.*)/)?.[1] || error || 'Rendering script failed';
          resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
        } else {
          const match = output.match(/DONE_VIDEO_FILE:(.*)/);
          if (match && match[1]) {
            const publicUrl = '/rendered/' + path.basename(outputFile);
            resolve(NextResponse.json({ success: true, url: publicUrl }));
          } else {
            const errMsg = output.match(/ERROR: (.*)/)?.[1] || 'Could not find output video path';
            resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
          }
        }
      });
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
