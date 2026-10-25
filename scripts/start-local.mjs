import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listenLocal } from './server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
if (Number(process.versions.node.split('.')[0])<22) throw new Error('Установите Node.js 22 или новее: https://nodejs.org/');
// Reuse the OS's trusted public roots on Windows; TLS verification stays enabled.
if(process.platform==='win32'&&!process.env.NODE_EXTRA_CA_CERTS&&!process.argv.includes('--system-trust')) {
  try {
    const command="$ErrorActionPreference='Stop'; foreach($location in @('LocalMachine','CurrentUser')) { $store=New-Object System.Security.Cryptography.X509Certificates.X509Store('Root',$location); try { $store.Open('ReadOnly'); foreach($certificate in $store.Certificates) { '-----BEGIN CERTIFICATE-----'; [Convert]::ToBase64String($certificate.RawData,[Base64FormattingOptions]::InsertLineBreaks); '-----END CERTIFICATE-----' } } finally { $store.Close() } }";
    const certificates=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',stdio:'pipe',windowsHide:true,maxBuffer:4*1024*1024});
    if(!certificates.includes('BEGIN CERTIFICATE'))throw new Error('No system roots');
    mkdirSync('.local',{recursive:true});
    const certificateFile=path.join(root,'.local','windows-trust.pem');writeFileSync(certificateFile,certificates);
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--system-trust',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,env:{...process.env,NODE_EXTRA_CA_CERTS:certificateFile}});
    process.on('SIGINT',()=>child.kill('SIGINT'));
    child.on('exit',code=>process.exit(code??0));
    await new Promise(()=>{});
  } catch {console.log('Используем стандартное хранилище сертификатов Node.js.');}
}
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT должен быть от 1024 до 65535');
const address=`http://localhost:${port}/`;
function openBrowser() {
  if(process.argv.includes('--no-open'))return;
  const command=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',address]]:process.platform==='darwin'?['open',[address]]:['xdg-open',[address]];
  execFile(command[0],command[1],{windowsHide:true},()=>{});
}
try {
  const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1500)});
  const health=await response.json();
  if(health.app==='nebosvod'&&health.mode==='local'){console.log(`Небосвод уже запущен: ${address}`);openBrowser();process.exit(0);}
} catch {}
function npm(args) {
  // Invoke npm's JS entry point directly when possible; no shell interpolation.
  const cli=process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  if(existsSync(cli))execFileSync(process.execPath,[cli,...args],{cwd:root,stdio:'inherit',windowsHide:true});
  else if(process.platform==='win32')execFileSync('cmd.exe',['/d','/c','npm.cmd',...args],{cwd:root,stdio:'inherit',windowsHide:true});
  else execFileSync('npm',args,{cwd:root,stdio:'inherit'});
}
try {
  if(!existsSync(path.join(root,'node_modules','vite','package.json'))){console.log('Первый запуск: загружаем зависимости…');npm(['ci']);}
  console.log('Подготавливаем локальную версию…');npm(['run','build']);
  const server=await listenLocal({port});
  console.log(`\nНебосвод готов: ${address}\nСервер доступен только на этом компьютере.\nДля свежих данных нужен интернет. Для остановки нажмите Ctrl+C.\n`);
  openBrowser();
  const stop=()=>server.close(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);
} catch(error) {console.error(error.code==='EADDRINUSE'?`Порт ${port} занят. Закройте другое приложение или задайте PORT.`:error.message);process.exitCode=1;}
