import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { videoFile, jsonFile, voice } = await req.json();

    if (!videoFile || !jsonFile || !voice) {
      return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400 });
    }

    const outputFile = path.join(process.cwd(), 'public', 'rendered', `output_${Date.now()}.mp4`);
    const fs = require('fs').promises;
    await fs.mkdir(path.dirname(outputFile), { recursive: true });

    const scriptPath = path.join(process.cwd(), 'scripts', 'render_video.py');
    const pyProcess = spawn('python3', [scriptPath, videoFile, jsonFile, voice, outputFile]);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;

        const safeEnqueue = (chunk: Uint8Array) => {
          if (!closed) {
            controller.enqueue(chunk);
          }
        };

        const safeClose = () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        };

        pyProcess.stdout.on('data', (data) => {
          safeEnqueue(encoder.encode(`DATA:${data.toString()}`));
        });
        pyProcess.stderr.on('data', (data) => {
          safeEnqueue(encoder.encode(`LOG:${data.toString()}`));
        });
        pyProcess.on('close', (code) => {
          if (code === 0) {
            safeEnqueue(encoder.encode('CLOSE:0'));
          } else {
            safeEnqueue(encoder.encode(`ERROR:Render exited with code ${code}`));
          }
          safeClose();
        });
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
