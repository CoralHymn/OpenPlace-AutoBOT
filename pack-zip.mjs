import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const distDir = join(__dirname, 'dist');
const zipName = '\u9ab7\u9ac5\u6253\u91d1\u670d-\u7b28\u5357\u74dcBOT.zip';
const zipPath = join(__dirname, zipName);

// clean old
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// copy extension files only
mkdirSync(distDir);
const include = ['manifest.json', 'extension', 'docs', 'LICENSE', 'README.md'];
for (const item of include) {
  const src = join(__dirname, item);
  const dest = join(distDir, item);
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
}

// zip
const isWin = process.platform === 'win32';
if (isWin) {
  execSync(
    `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd "${distDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
}

// clean up
rmSync(distDir, { recursive: true });
console.log(`OK: ${zipName}`);
