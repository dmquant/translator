import { NextRequest, NextResponse } from 'next/server';
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
      return NextResponse.json({ error: 'No video file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(tempDir, { recursive: true });
    
    const filePath = path.join(tempDir, file.name);
    await fs.writeFile(filePath, buffer);

    const scriptPath = path.join(process.cwd(), 'scripts', 'transcribe_and_translate.py');
    
    return new Promise<NextResponse>((resolve) => {
      // Pass current environment to spawn so GEMINI_API_KEY is available
      const pyProcess = spawn('python3', [scriptPath, filePath, targetLang, engine], {
        env: { ...process.env }
      });
      
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

      pyProcess.on('close', async (code) => {
        if (code !== 0) {
          const errMsg = output.match(/ERROR: (.*)/)?.[1] || error || 'Transcription/Translation failed';
          resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
        } else {
          const match = output.match(/DONE_JSON_FILE:(.*)/);
          if (match && match[1]) {
            const jsonPath = match[1].trim();
            const jsonData = await fs.readFile(jsonPath, 'utf-8');
            resolve(NextResponse.json({ 
              success: true, 
              segments: JSON.parse(jsonData),
              jsonFile: jsonPath,
              videoFile: filePath
            }));
          } else {
            const errMsg = output.match(/ERROR: (.*)/)?.[1] || 'Could not find JSON output';
            resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
          }
        }
      });
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
