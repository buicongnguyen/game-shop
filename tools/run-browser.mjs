import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{stdio:'pipe',env:{...process.env,PORT:String(port)}});
try {
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local test server did not start.')),10000);server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});server.once('error',reject);server.once('exit',code=>{if(code)reject(Error('Test server exited '+code));});});
  const tests=spawn(process.execPath,['tests/parity-browser.mjs'],{stdio:'inherit',env:{...process.env,PARITY_URL:url}});
  const [code]=await once(tests,'exit');if(code)process.exitCode=code;
} finally { server.kill(); }
