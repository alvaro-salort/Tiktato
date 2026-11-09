const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TikTokService } = require('../electron/tiktok-service.cjs');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');

test('connection-message permite saltos de línea para errores largos y cuenta con estilo ámbar para reconexión', () => {
  // No debe truncar con ellipsis ni forzar nowrap
  assert.doesNotMatch(stylesCss, /\.connection-message\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(stylesCss, /\.connection-message\s*\{[^}]*white-space:\s*nowrap/);

  // Debe permitir envolver líneas
  assert.match(stylesCss, /\.connection-message\s*\{[^}]*white-space:\s*normal/);
  assert.match(stylesCss, /\.connection-message\s*\{[^}]*word-break:\s*break-word/);

  // Cartelito ámbar de reconexión
  assert.match(stylesCss, /\.connection-message\.is-reconnecting/);
  assert.match(stylesCss, /background:\s*var\(--amber-soft\)/);
});

test('controles de ducking cuentan con slider de porcentaje en TTS y ajustes generales de audio', () => {
  // Slider en la pestaña TTS
  assert.match(indexHtml, /id="ttsDuckingLevel"[^>]*type="range"/);
  assert.match(indexHtml, /id="ttsDuckingLevelValue"/);

  // Controles en el modal de Ajustes generales
  assert.match(indexHtml, /id="settingsAudioDucking"[^>]*type="checkbox"/);
  assert.match(indexHtml, /id="settingsAudioDuckingLevel"[^>]*type="range"/);
  assert.match(indexHtml, /id="settingsAudioDuckingLevelValue"/);

  // app.js sincroniza ambos controles y persiste duckingLevel
  assert.match(appJs, /ttsDuckingLevel/);
  assert.match(appJs, /settingsAudioDucking/);
  assert.match(appJs, /saveTtsPatch\(\{\s*duckingLevel:/);
});

test('editar regla desde el diálogo modal avanzado cierra el modal para no bloquear la edición', () => {
  // En #rulesList, la acción edit debe cerrar el diálogo modal
  assert.match(appJs, /\$\('#rulesDialog'\)\?\.close\(\);[\s\r\n]*openRuleForm\(rule\);/);
});

test('eliminar regla en giftQuickList pide confirmación previa al usuario', () => {
  assert.match(appJs, /if\s*\(!confirm\(['"]¿Eliminar esta regla\?['"]\)\)\s*return;/);
});

test('los chips presets abren el formulario de regla sin guardar silenciosamente en disco', () => {
  // No debe llamar a saveRules dentro del click handler de giftPresets
  const presetBlock = appJs.match(/\$\('#giftPresets'\)\?\.addEventListener\('click'[\s\S]*?\$\('#giftQuickList'\)/);
  assert.ok(presetBlock, 'Debe existir el handler de giftPresets');
  assert.doesNotMatch(presetBlock[0], /await\s+saveRules\(/, 'No debe auto-guardar sin confirmación del usuario');
  assert.match(presetBlock[0], /openRuleForm\(savedRule \|\| newRule\)/);
});

test('app.js deshabilita btnConnect y username cuando está conectado o reconectando', () => {
  assert.match(appJs, /usernameInput\.disabled\s*=\s*isConnected\s*\|\|\s*isConnecting/);
  assert.match(appJs, /connect\.disabled\s*=\s*isConnected\s*\|\|\s*isConnecting/);
  assert.match(appJs, /disconnect\.disabled\s*=\s*!\(isConnected\s*\|\|\s*isConnecting\s*\|\|\s*isError\)/);
});

test('TikTokService emite formato de mensaje de reconexión durante el sondeo y limpia temporizador en disconnect', async () => {
  const service = new TikTokService();
  assert.ok(typeof service.disconnect === 'function');
  assert.equal(service.status.state, 'disconnected');
  assert.equal(service.status.reconnecting, false);
  assert.equal(service.status.retryIn, 0);

  // Simular que el servicio estaba en medio de sondeo/reconexión
  service.status.reconnecting = true;
  service.status.retryIn = 15;
  await service.disconnect();

  assert.equal(service.status.state, 'disconnected');
  assert.equal(service.status.reconnecting, false);
  assert.equal(service.status.retryIn, 0);
  assert.equal(service.pollTimer, null);
  assert.equal(service.pollTimeout, null);
});

test('TTSQueue realiza fallback local sin ReferenceError si la API de Google falla', async () => {
  const { TTSQueue } = await import('../shared/tts-engine.js');
  const queue = new TTSQueue();

  queue.enqueue({
    text: 'Prueba de voz en español',
    voiceProvider: 'google',
    voiceId: 'google:es-ES',
    voiceLanguage: 'es-ES'
  });

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(queue.isSpeaking, false);
});
