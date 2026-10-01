import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
// SUITES=a.mjs,b.mjs runs only those files from tests/ (default: every browser suite).
const allSuites = ['parity-browser.mjs', 'mobile-interaction.mjs', 'mobile-layout.mjs', 'pwa-browser.mjs', 'fx-browser.mjs', 'life-browser.mjs'];
const suites = process.env.SUITES ? process.env.SUITES.split(',').map(name => name.trim()).filter(Boolean) : allSuites;
for (const name of suites) if (!/^[\w.-]+\.mjs$/.test(name)) throw new Error(`SUITES lists an invalid file name: ${name}`);
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{stdio:'pipe',env:{...process.env,PORT:String(port)}});
try {
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local test server did not start.')),10000);server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});server.once('error',reject);server.once('exit',code=>{if(code)reject(Error('Test server exited '+code));});});
  for (const file of suites) {
    const tests=spawn(process.execPath,[`tests/${file}`],{stdio:'inherit',env:{...process.env,PARITY_URL:url}});
    const [code,signal]=await once(tests,'exit');if(code!==0)process.exitCode=code||1;
    if(signal)console.error(`${file} terminated with ${signal}.`);
  }
} finally { server.kill(); }
