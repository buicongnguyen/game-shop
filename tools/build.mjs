import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await copyFile('index.html','dist/index.html');
await cp('src','dist/src',{recursive:true});
await cp('public/assets','dist/assets',{recursive:true});
await writeFile('dist/.nojekyll','');
console.log('Static app built in dist/');
