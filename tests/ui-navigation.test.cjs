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
  assert.doesNotMatch(indexHtml, /\bPro\b/, 'index.html no debe usar la palabra "Pro"');
  assert.doesNotMatch(stylesCss, /\bPro\b/, 'styles.css no debe usar la palabra "Pro"');
  assert.doesNotMatch(appJs, /\bPro\b/, 'app.js no debe usar la palabra "Pro"');
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

test('fase 1: contraste WCAG 2.1 AA, desacoplamiento de input numérico tts y métricas KPI de banner', () => {
  // Variables WCAG AA en styles.css
  assert.match(stylesCss, /--muted:\s*#6e584d;/);
  assert.match(stylesCss, /--green:\s*#0d6844;/);
  assert.match(stylesCss, /--green-surface:\s*#f2faf6;/);

  // Verificación matemática de ratio de contraste WCAG 2.1 AA (mínimo 4.5:1)
  function hexToLuminance(hex) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }
  function contrastRatio(hex1, hex2) {
    const l1 = hexToLuminance(hex1);
    const l2 = hexToLuminance(hex2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  const mutedOnSurface2 = contrastRatio('#6e584d', '#fcf2eb');
  assert.ok(mutedOnSurface2 >= 4.5, `--muted sobre --surface-2 ratio debe ser >= 4.5 (obtenido: ${mutedOnSurface2.toFixed(2)})`);
  const greenOnGreenSoft = contrastRatio('#0d6844', '#e3f4ec');
  assert.ok(greenOnGreenSoft >= 4.5, `--green sobre --green-soft ratio debe ser >= 4.5 (obtenido: ${greenOnGreenSoft.toFixed(2)})`);
  const mutedOnGreenSurface = contrastRatio('#6e584d', '#f2faf6');
  assert.ok(mutedOnGreenSurface >= 4.5, `--muted sobre --green-surface ratio debe ser >= 4.5 (obtenido: ${mutedOnGreenSurface.toFixed(2)})`);

  // Desacoplar input numérico en filtros de rol de TTS
  assert.match(indexHtml, /class="role-filter-row"/);
  assert.match(indexHtml, /class="role-level-subfield"/);
  const gifterLabelMatch = indexHtml.match(/<label[^>]*for="ttsAllowGifter"[^>]*>[\s\S]*?<\/label>/) ||
                           indexHtml.match(/<label[^>]*>[\s\S]*?id="ttsAllowGifter"[\s\S]*?<\/label>/);
  assert.ok(gifterLabelMatch, 'Debe existir el label de ttsAllowGifter');
  assert.doesNotMatch(gifterLabelMatch[0], /id="ttsMinGifterLevel"/, 'ttsMinGifterLevel no debe estar anidado dentro del label de ttsAllowGifter');

  const memberLabelMatch = indexHtml.match(/<label[^>]*for="ttsAllowMember"[^>]*>[\s\S]*?<\/label>/) ||
                           indexHtml.match(/<label[^>]*>[\s\S]*?id="ttsAllowMember"[\s\S]*?<\/label>/);
  assert.ok(memberLabelMatch, 'Debe existir el label de ttsAllowMember');
  assert.doesNotMatch(memberLabelMatch[0], /id="ttsMinMemberLevel"/, 'ttsMinMemberLevel no debe estar anidado dentro del label de ttsAllowMember');

  // Símbolo @ en input-prefix y placeholder usuario
  assert.match(indexHtml, /<span class="prefix-symbol" aria-hidden="true">@<\/span>/);
  assert.match(indexHtml, /<input id="username"[^>]*placeholder="usuario"/);
  assert.match(stylesCss, /\.input-prefix\s*\.prefix-symbol/);

  // Métricas KPI de banner completas
  assert.match(stylesCss, /\.metric-tile\s*\{[^}]*padding:\s*8px 12px;/);
  assert.match(stylesCss, /\.metric-tile\s*\{[^}]*min-width:\s*96px;/);
  assert.match(stylesCss, /\.metric-tile\s*\{[^}]*border:\s*1px solid var\(--line\);/);
  assert.match(stylesCss, /\.metric-tile:hover\s*\{[^}]*transform:\s*translateY\(-1px\);/);
  assert.match(stylesCss, /\.metric-tile:hover\s*\{[^}]*box-shadow:/);

  assert.match(stylesCss, /\.metric-value strong\s*\{[^}]*font-size:\s*18px;/);
  assert.match(stylesCss, /\.metric-value strong\s*\{[^}]*font-weight:\s*700;/);
  assert.match(stylesCss, /\.metric-value strong\s*\{[^}]*line-height:\s*1\.1;/);
  assert.match(stylesCss, /\.metric-value strong\s*\{[^}]*color:\s*var\(--ink\);/);
  assert.match(stylesCss, /\.metric-value strong\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/);

  assert.match(stylesCss, /\.metric-value small\s*\{[^}]*font-size:\s*11px;/);
  assert.match(stylesCss, /\.metric-value small\s*\{[^}]*font-weight:\s*600;/);
  assert.match(stylesCss, /\.metric-value small\s*\{[^}]*color:\s*var\(--ink-soft\);/);
  assert.match(stylesCss, /\.metric-value small\s*\{[^}]*text-transform:\s*uppercase;/);
  assert.match(stylesCss, /\.metric-value small\s*\{[^}]*letter-spacing:\s*0\.05em;/);
  assert.match(stylesCss, /\.metric-value small\s*\{[^}]*margin-top:\s*1px;/);
});

test('fase 2: maquetación split-view en 2 columnas y card-activity fija con sticky', () => {
  // Grid de 2 columnas en escritorio
  assert.match(stylesCss, /\.sounds-workspace-grid\s*\{[^}]*display:\s*grid;/);
  assert.match(stylesCss, /\.sounds-workspace-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*7fr\)\s*minmax\(320px,\s*5fr\);/);
  assert.match(stylesCss, /\.sounds-workspace-grid\s*\{[^}]*gap:\s*16px;/);
  assert.match(stylesCss, /\.sounds-workspace-grid\s*\{[^}]*align-items:\s*start;/);
  assert.match(stylesCss, /\.sounds-workspace-grid\s*\{[^}]*width:\s*100%;/);

  // Sticky para card-activity
  assert.match(stylesCss, /\.sounds-workspace-grid \.card-activity\s*\{[^}]*position:\s*sticky;/);
  assert.match(stylesCss, /\.sounds-workspace-grid \.card-activity\s*\{[^}]*top:\s*16px;/);
  assert.match(stylesCss, /\.sounds-workspace-grid \.card-activity\s*\{[^}]*max-height:\s*calc\(100vh - 120px\);/);
  assert.match(stylesCss, /\.sounds-workspace-grid \.card-activity\s*\{[^}]*overflow-y:\s*auto;/);

  // Responsive a 1 columna bajo 960px con posición estática
  assert.match(stylesCss, /@media\s*\(max-width:\s*960px\)\s*\{[\s\S]*?\.sounds-workspace-grid[^}]*grid-template-columns:\s*1fr;/);
  assert.match(stylesCss, /@media\s*\(max-width:\s*960px\)\s*\{[\s\S]*?\.sounds-workspace-grid \.card-activity[^}]*position:\s*static;/);

  // Eliminación de código muerto span 12
  assert.doesNotMatch(stylesCss, /\.card-sounds\s*\{[^}]*grid-column:\s*span 12;/);
  assert.doesNotMatch(stylesCss, /\.card-activity\s*\{[^}]*grid-column:\s*span 12;/);
});

test('banner superior sin logo redundante para dar espacio a conexión y estado', () => {
  // Extraer el bloque del banner superior
  const bannerMatch = indexHtml.match(/<header id="bannerCard"[\s\S]*?<\/header>/);
  assert.ok(bannerMatch, 'Debe existir header #bannerCard');
  const bannerHtml = bannerMatch[0];

  // No debe contener el bloque repetido de marca/logo en el banner (la barra lateral ya lo tiene)
  assert.doesNotMatch(bannerHtml, /class="banner-brand"/, 'bannerCard no debe repetir el logo de marca');
  assert.doesNotMatch(bannerHtml, /class="brand-logo"/, 'bannerCard no debe repetir la imagen del logo');

  // Debe contener conexión y estadísticas con espacio
  assert.match(bannerHtml, /class="banner-connect"/);
  assert.match(bannerHtml, /class="banner-stats"/);
});

test('reproducir sonido en reglas invoca previsualización de audio sin enviar eventos de prueba', () => {
  // Los botones de reproducir en giftQuickList deben usar previewSoundById y no triggerTestForRule
  const quickListHandler = appJs.match(/#giftQuickList'\)\??\.addEventListener\('click'[\s\S]*?action === 'test'[\s\S]*?return;[\s\S]*?}\);/);
  assert.ok(quickListHandler, 'Debe existir el manejador de click para #giftQuickList');
  assert.match(quickListHandler[0], /previewSoundById\(/, '#giftQuickList play debe llamar a previewSoundById');
  assert.doesNotMatch(quickListHandler[0], /triggerTestForRule\(/, '#giftQuickList play no debe llamar a triggerTestForRule');

  // En #rulesList (modal de reglas) el botón de test debe usar previewSoundById
  const rulesListHandler = appJs.match(/#rulesList'\)\??\.addEventListener\('click'[\s\S]*?action === 'test'[\s\S]*?return;[\s\S]*?}\);/);
  assert.ok(rulesListHandler, 'Debe existir el manejador de click para #rulesList');
  assert.match(rulesListHandler[0], /previewSoundById\(/, '#rulesList play debe llamar a previewSoundById');
  assert.doesNotMatch(rulesListHandler[0], /triggerTestForRule\(/, '#rulesList play no debe llamar a triggerTestForRule');

  // En electron/main.cjs, registerActivity y addToJar no deben sumar a stats ni frasco cuando event.test es true
  const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(mainCjs, /if \(!event\.test\)\s*\{[\s\S]*?stats\.gifts \+= 1;[\s\S]*?stats\.coins \+= Number\(event\.coins \|\| 0\);/);
  assert.match(mainCjs, /if \(!event\.test\)\s*\{[\s\S]*?config\.jar\.currentGifts \+= 1;[\s\S]*?config\.jar\.currentCoins \+= coinsAdded;/);
});

test('indicador visual de foco en username contenido en input-prefix sin rectángulo interior', () => {
  // input-prefix:focus-within gestiona el contorno de foco exterior
  assert.match(stylesCss, /\.input-prefix:focus-within\s*\{[^}]*border-color:\s*var\(--md-primary\);/);
  assert.match(stylesCss, /\.input-prefix:focus-within\s*\{[^}]*box-shadow:/);

  // username y input interno no tienen borde ni outline ni sombra interna
  assert.match(stylesCss, /\.input-prefix input[\s\S]*?border:\s*none !important;/);
  assert.match(stylesCss, /\.input-prefix input[\s\S]*?outline:\s*none !important;/);
  assert.match(stylesCss, /\.input-prefix input[\s\S]*?box-shadow:\s*none !important;/);
});

test('encabezado de sonidos alinea verticalmente título y acciones sin texto superpuesto', () => {
  // En index.html no existe el subtítulo que quedaba tapado debajo de los botones
  const cardSoundsHeadMatch = indexHtml.match(/<section class="card card-sounds">[\s\S]*?<header class="card-head">([\s\S]*?)<\/header>/);
  assert.ok(cardSoundsHeadMatch, 'Debe existir header en card-sounds');
  const headHtml = cardSoundsHeadMatch[1];
  assert.doesNotMatch(headHtml, /Asigna qué sonido suena al recibir cada interacción/, 'El subtítulo obstructivo debe ser removido');
  assert.match(headHtml, /Sonidos por regalos y eventos/, 'El encabezado debe usar Sonidos por regalos y eventos');

  // En styles.css .card-sounds .card-head alinea título y botones
  assert.match(stylesCss, /\.card-sounds \.card-head\s*\{[^}]*display:\s*flex;/);
  assert.match(stylesCss, /\.card-sounds \.card-head\s*\{[^}]*align-items:\s*center;/);
  assert.match(stylesCss, /\.card-sounds \.card-head\s*\{[^}]*justify-content:\s*space-between;/);
  assert.match(stylesCss, /\.card-sounds \.card-head\s*\{[^}]*flex-wrap:\s*wrap;/);
});
