const localtunnel = require('localtunnel');
const fs = require('fs');

let currentTunnel = null;

async function start() {
  if (currentTunnel) {
    try {
      currentTunnel.close();
    } catch {}
  }

  const sub = 'trypo-' + Math.floor(10000 + Math.random() * 90000);
  try {
    console.log('Connecting tunnel to 127.0.0.1:8443 with subdomain:', sub);
    const tunnel = await localtunnel({
      port: 8443,
      local_host: '127.0.0.1',
      subdomain: sub
    });
    currentTunnel = tunnel;
    console.log('=== TRYPO LIVE TUNNEL ONLINE ===');
    console.log('URL:', tunnel.url);
    fs.writeFileSync('tunnel-url.txt', tunnel.url, 'utf8');

    tunnel.on('close', () => {
      console.log('Tunnel closed. Reopening in 3s...');
      setTimeout(start, 3000);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err?.message || err);
      setTimeout(start, 3000);
    });
  } catch (err) {
    console.error('Failed to initialize tunnel:', err?.message || err);
    setTimeout(start, 4000);
  }
}

// Keep event loop alive
setInterval(() => {}, 1000 * 60 * 60);

start();
