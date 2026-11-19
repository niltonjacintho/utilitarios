import { spawn } from 'node:child_process';

const processes = [
  spawn('npm', ['--prefix', 'backend', 'run', 'start:dev'], {
    stdio: 'inherit',
    shell: true,
  }),
  spawn('npm', ['--prefix', 'frontend', 'run', 'dev'], {
    stdio: 'inherit',
    shell: true,
  }),
  spawn('npm', ['--prefix', 'mindmap', 'run', 'dev'], {
    stdio: 'inherit',
    shell: true,
  }),
  spawn('npm', ['--prefix', 'flowchart', 'run', 'dev'], {
    stdio: 'inherit',
    shell: true,
  }),
  spawn('npm', ['--prefix', 'erstudio', 'run', 'dev'], {
    stdio: 'inherit',
    shell: true,
  }),
];

function shutdown() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
