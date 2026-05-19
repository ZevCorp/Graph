const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'chrome-extension-src', 'graph-trainer');
const runtimeRoot = path.join(repoRoot, 'web', 'public');
const generatedRoot = path.join(repoRoot, 'generated', 'chrome-extension');
const outputRoot = path.join(generatedRoot, 'graph-trainer');
const shareRoot = path.join(generatedRoot, 'graph-trainer-para-enviar');
const shareExtensionRoot = path.join(shareRoot, 'graph-trainer-extension');
const shareZipPath = path.join(shareRoot, 'graph-trainer-extension.zip');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function copyDirectoryContents(fromDir, toDir) {
  ensureDir(toDir);
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(from, to);
    } else {
      copyFile(from, to);
    }
  }
}

function build() {
  removeDir(outputRoot);
  ensureDir(outputRoot);

  copyDirectoryContents(sourceRoot, outputRoot);

  copyFile(path.join(runtimeRoot, 'page-state.js'), path.join(outputRoot, 'assets', 'page-state.js'));
  copyFile(path.join(runtimeRoot, 'recorder.js'), path.join(outputRoot, 'assets', 'recorder.js'));
  copyFile(path.join(runtimeRoot, 'assistant-runtime.js'), path.join(outputRoot, 'assets', 'assistant-runtime.js'));
  copyFile(path.join(runtimeRoot, 'trainer-plugin.js'), path.join(outputRoot, 'assets', 'trainer-plugin.js'));
  copyDirectoryContents(path.join(runtimeRoot, 'plugin'), path.join(outputRoot, 'assets', 'plugin'));

  const readme = [
    '# Graph Trainer Chrome Extension',
    '',
    '1. Open `chrome://extensions`.',
    '2. Enable Developer mode.',
    '3. Click "Load unpacked".',
    `4. Select this folder: ${outputRoot}`,
    '5. Open the extension popup and confirm the backend URL.',
    '6. Reload the target webpage.',
    '7. Miracle link: https://www.miracle.clinic/'
  ].join('\n');

  fs.writeFileSync(path.join(outputRoot, 'README.txt'), readme);

  removeDir(shareExtensionRoot);
  ensureDir(shareRoot);
  copyDirectoryContents(outputRoot, shareExtensionRoot);

  const shareReadme = [
    '# Graph Trainer Chrome Extension',
    '',
    '1. Open `chrome://extensions`.',
    '2. Enable Developer mode.',
    '3. Click "Load unpacked".',
    `4. Select this folder: ${shareExtensionRoot}`,
    '5. Open the extension popup and confirm the backend URL.',
    '6. Reload the target webpage.',
    '7. Miracle link: https://www.miracle.clinic/'
  ].join('\n');
  fs.writeFileSync(path.join(shareExtensionRoot, 'README.txt'), shareReadme);

  if (fs.existsSync(shareZipPath)) {
    fs.rmSync(shareZipPath, { force: true });
  }

  try {
    const zip = require('child_process').spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${shareExtensionRoot}\\*' -DestinationPath '${shareZipPath}'`
    ], { stdio: 'inherit' });
    if (zip.status !== 0) {
      throw new Error(`Zip packaging failed with status ${zip.status}`);
    }
  } catch (error) {
    console.warn(`Could not create zip package automatically: ${error.message}`);
  }

  console.log(`Chrome extension generated at: ${outputRoot}`);
  console.log(`Shareable extension generated at: ${shareExtensionRoot}`);
}

build();
