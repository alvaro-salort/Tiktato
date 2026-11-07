'use strict';

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function patchFile(relPath, before, after) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes(after)) return;
  if (!content.includes(before)) {
    throw new Error(`No se encontró el bloque esperado para parchear en ${relPath}`);
  }
  fs.writeFileSync(fullPath, content.replace(before, after), 'utf8');
  console.log(`[apply-patches] Parche aplicado en ${relPath}`);
}

patchFile(
  'node_modules/piratetok-live-js/dist/client.d.ts',
  '    connect(): Promise<string>;',
  '    connect(roomIdOverride?: string): Promise<string>;'
);

patchFile(
  'node_modules/piratetok-live-js/dist/client.js',
  `    async connect() {
        const lang = this._language ?? systemLanguage();
        const reg = this._region ?? systemRegion();
        const acceptLang = \`\${lang}-\${reg},\${lang};q=0.9\`;
        const { roomId } = await checkOnline(this.username, this.timeoutMs, lang, reg, this._proxy);`,
  `    async connect(roomIdOverride) {
        const lang = this._language ?? systemLanguage();
        const reg = this._region ?? systemRegion();
        const acceptLang = \`\${lang}-\${reg},\${lang};q=0.9\`;
        const roomId = roomIdOverride || (await checkOnline(this.username, this.timeoutMs, lang, reg, this._proxy)).roomId;`
);
