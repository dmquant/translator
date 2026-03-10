import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    const targetLang = formData.get('lang') as string || 'zh-CN';
    const engine = formData.get('engine') as string || 'google';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No video file' }), { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, file.name);
    await fs.writeFile(filePath, buffer);

    const scriptPath = path.join(process.cwd(), 'scripts', 'transcribe_and_translate.py');
    const pyProcess = spawn('python3', [scriptPath, filePath, targetLang, engine], {
      env: { ...process.env }
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        pyProcess.stdout.on('data', (data) => {
          controller.enqueue(encoder.encode(`DATA:${data.toString()}`));
        });
        pyProcess.stderr.on('data', (data) => {
          controller.enqueue(encoder.encode(`LOG:${data.toString()}`));
        });
        pyProcess.on('close', (code) => {
          if (code === 0) {
            controller.enqueue(encoder.encode('CLOSE:0'));
          } else {
            controller.enqueue(encoder.encode(`ERROR:Process exited with code ${code}`));
          }
          controller.close();
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
