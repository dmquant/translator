import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const lang = searchParams.get('lang');

  const scriptPath = path.join(process.cwd(), 'scripts', 'get_voices.py');
  
  return new Promise<NextResponse>((resolve) => {
    const args = [scriptPath];
    if (lang) {
      args.push(lang);
    }
    
    const pyProcess = spawn('python3', args);
    let output = '';

    pyProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: 'Failed to fetch voices' }, { status: 500 }));
      } else {
        try {
          const voices = JSON.parse(output);
          resolve(NextResponse.json({ voices }));
        } catch (e) {
          resolve(NextResponse.json({ error: 'Invalid voice data', raw: output }, { status: 500 }));
        }
      }
    });
  });
}
