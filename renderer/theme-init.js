/* Aplica el tema antes del primer pintado para que la ventana no destelle.
   Preferencia guardada en localStorage "tiktato.theme":
   - "light" | "dark": elección manual de la persona.
   - "auto" o sin valor: se resuelve según la hora del equipo. */
(() => {
  const STORAGE_KEY = 'tiktato.theme';
  const NIGHT_START_HOUR = 20;
  const NIGHT_END_HOUR = 7;

  const isNightTime = (date = new Date()) => {
    const hour = date.getHours();
    return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
  };

  let preference = '';
  try {
    preference = localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    preference = '';
  }

  const theme =
    preference === 'light' || preference === 'dark'
      ? preference
      : isNightTime()
        ? 'dark'
        : 'light';

  document.documentElement.dataset.theme = theme;
})();
