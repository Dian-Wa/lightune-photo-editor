import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const commands = [
  ['vite', fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--strictPort'],
  ['api', '--env-file-if-exists=.env', fileURLToPath(new URL('../server/index.ts', import.meta.url))],
];

let shuttingDown = false;
const children = commands.map(([name, ...args]) => {
  const child = spawn(process.execPath, args, { cwd: projectRoot, stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`${name} 启动失败: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${name} 已退出（代码 ${code ?? '未知'}）`);
      stop(code || 1);
    }
  });
  return child;
});

function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
