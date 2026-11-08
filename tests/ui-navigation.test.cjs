const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');

test('index.html cuenta con menú lateral de 4 secciones y estructura de pestañas accesible', () => {
  // Sidebar navigation
  assert.match(indexHtml, /class="[^"]*app-sidebar[^"]*"/);
  assert.match(indexHtml, /id="tab-sounds"[^>]*data-tab="sounds"[^>]*aria-controls="panel-sounds"/);
  assert.match(indexHtml, /id="tab-overlay"[^>]*data-tab="overlay"[^>]*aria-controls="panel-overlay"/);
  assert.match(indexHtml, /id="tab-jar"[^>]*data-tab="jar"[^>]*aria-controls="panel-jar"/);
  assert.match(indexHtml, /id="tab-tts"[^>]*data-tab="tts"[^>]*aria-controls="panel-tts"/);

  // Tab panels
  assert.match(indexHtml, /id="panel-sounds"[^>]*role="tabpanel"/);
  assert.match(indexHtml, /id="panel-overlay"[^>]*role="tabpanel"/);
  assert.match(indexHtml, /id="panel-jar"[^>]*role="tabpanel"/);
  assert.match(indexHtml, /id="panel-tts"[^>]*role="tabpanel"/);

  // Default active tab is sounds, others are hidden
  assert.match(indexHtml, /id="tab-sounds"[^>]*aria-selected="true"/);
  assert.match(indexHtml, /id="panel-overlay"[^>]*hidden/);
  assert.match(indexHtml, /id="panel-jar"[^>]*hidden/);
  assert.match(indexHtml, /id="panel-tts"[^>]*hidden/);
});

test('todos los IDs requeridos por app.js están presentes en index.html sin duplicados', () => {
  // Extraer todos los IDs de index.html
  const re = /id="([^"]+)"/g;
  let match;
  const counts = {};
  while ((match = re.exec(indexHtml)) !== null) {
    counts[match[1]] = (counts[match[1]] || 0) + 1;
  }
  const duplicates = Object.entries(counts).filter(([_, count]) => count > 1);
  assert.deepEqual(duplicates, [], 'No debe haber IDs duplicados en index.html');

  // Verificar IDs esenciales de banner, sonidos, actividad, overlay, frasco, tts y modales
  const requiredIds = [
    'toast',
    'bannerCard',
    'connectForm',
    'username',
    'btnConnect',
    'btnDisconnect',
    'statusPill',
    'statusLabel',
    'liveBadge',
    'connectionMessage',
    'statViewers',
    'statGifts',
    'statCoins',
    'statFollows',
    'btnSettings',
    'btnHelp',
    'btnPickGift',
    'btnAdvancedRules',
    'giftPresets',
    'giftQuickList',
    'quickRules',
    'ruleFormWrap',
    'ruleForm',
    'activityList',
    'activityEmpty',
    'overlayUrl',
    'btnCopyOverlay',
    'btnOpenOverlay',
    'btnOverlaySettings',
    'jarCard',
    'jarPercent',
    'jarFill',
    'jarAmount',
    'jarGifts',
    'jarGoal',
    'btnTestGiftRose',
    'btnTestGiftCombo',
    'btnTestGiftGalaxy',
    'jarUrl',
    'btnCopyJar',
    'btnOpenJarStudio',
    'btnOpenJar',
    'btnJarSettings',
    'btnResetJar',
    'ttsQueueBadge',
    'ttsChatEnabled',
    'ttsReadUsername',
    'ttsGiftsEnabled',
    'ttsVoiceProvider',
    'ttsVolume',
    'ttsVolumeValue',
    'ttsDucking',
    'ttsAntiSpam',
    'ttsPlayEveryStreak',
    'btnTestTTS',
    'btnSkipTTS',
    'btnClearTTS',
    'helpDialog',
    'rulesDialog',
    'soundsDialog',
    'overlayDialog',
    'jarDialog',
    'settingsDialog'
  ];

  for (const id of requiredIds) {
    assert.ok(counts[id] >= 1, `ID requerido "#${id}" no encontrado en index.html`);
  }
});

test('no se utiliza la palabra "Pro" en la interfaz de usuario ni en el frasco', () => {
  // El frasco de donaciones es gratuito y no debe contener "Pro"
  const panelJarMatch = indexHtml.match(/<div id="panel-jar"[\s\S]*?<\/div>\s*<!-- =/);
  assert.ok(panelJarMatch, 'Debe existir el panel del frasco');
  const panelJarHtml = panelJarMatch[0];
  assert.doesNotMatch(panelJarHtml, /\bPro\b/i, 'El frasco no debe usar la palabra "Pro"');
});

test('la barra de regalos presets muestra regalos configurados y permite personalizarlos', () => {
  assert.match(appJs, /function renderGiftPresets\(\)/);
  // Agrega regalos configurados dinámicamente a la barra superior
  assert.match(appJs, /getSpecificGiftRules/);
  // Muestra distintivo de configurado (✓)
  assert.match(appJs, /preset-check/);
  assert.match(appJs, /is-configured/);
  // Al tocar un regalo configurado abre su edición personalizada
  assert.match(appJs, /openRuleForm\(existing\)/);
  // Al tocar un regalo nuevo crea la regla y abre su edición
  assert.match(appJs, /openRuleForm\(savedRule \|\| newRule\)/);
  // Quick list tiene acción de editar
  assert.match(appJs, /data-gift-rule-action="edit"/);
});

test('estilos css contienen reglas para sidebar, tabs y barra destacada de regalos', () => {
  assert.match(stylesCss, /\.app-sidebar/);
  assert.match(stylesCss, /\.nav-tab/);
  assert.match(stylesCss, /\.nav-tab\.is-active/);
  assert.match(stylesCss, /\.gift-presets-wrap/);
  assert.match(stylesCss, /\.gift-preset-chip\.is-configured/);
  assert.match(stylesCss, /\.preset-check/);
  assert.match(stylesCss, /\.sounds-workspace-grid/);
  assert.match(stylesCss, /\.overlay-layout/);
  assert.match(stylesCss, /\.jar-body-layout/);
  assert.match(stylesCss, /\.tts-body-layout/);
});
