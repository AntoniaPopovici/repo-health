const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'webview', 'dashboard.html');
const destDir = path.join(__dirname, '..', 'out', 'webview');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'dashboard.html'));
