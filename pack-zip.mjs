import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const distDir = join(__dirname, 'dist');
const zipName = 'WPlace-AutoBOT.zip';
const zipPath = join(__dirname, zipName);

// 清理旧产物
if (existsSync(distDir)) rmSync(distDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// 只复制扩展所需文件
mkdirSync(distDir);
const include = ['manifest.json', 'extension', 'docs', 'LICENSE', 'README.md'];
for (const item of include) {
  const src = join(__dirname, item);
  const dest = join(distDir, item);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

// 压缩
const isWin = process.platform === 'win32';
if (isWin) {
  execSync(
    `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd "${distDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
}

// 清理临时目录
rmSync(distDir, { recursive: true });
console.log(`✅ 打包完成: ${zipName}`);
