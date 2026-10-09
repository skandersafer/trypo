const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const urlFilePath = path.join(__dirname, 'active-serveo-url.txt');

function runTunnel() {
  console.log('[Tunnel] Starting Serveo SSH tunnel...');
  const child = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=8',
    '-o', 'ServerAliveCountMax=2',
    '-R', '80:127.0.0.1:8443',
    'serveo.net'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const handleOutput = (text) => {
    console.log('[Serveo]', text);
    if (text.includes('expired') || text.includes('failed') || text.includes('disconnect')) {
      console.log('[Tunnel] Expired or disconnected. Killing process to trigger fast restart...');
      try { child.kill('SIGKILL'); } catch {}
    }
    const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.serveousercontent\.com/);
    if (match) {
      const url = match[0];
      console.log('>>> ACTIVE PUBLIC URL:', url);
      fs.writeFileSync(urlFilePath, url, 'utf8');
    }
  };

  child.stdout.on('data', (d) => handleOutput(d.toString()));
  child.stderr.on('data', (d) => handleOutput(d.toString()));

  child.on('close', (code) => {
    console.log(`[Tunnel] SSH connection closed (code ${code}). Reconnecting in 1.5s...`);
    setTimeout(runTunnel, 1500);
  });

  child.on('error', (err) => {
    console.error('[Tunnel] Spawn error:', err);
    setTimeout(runTunnel, 1500);
  });
}

runTunnel();
