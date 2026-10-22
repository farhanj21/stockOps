/**
 * Per-device display settings, applied by an inline <head> script before the page paints so the
 * saved theme and sidebar state never flash. Kept out of 'use client' modules so the server
 * layout can read the script text.
 */
export const THEME_KEY = 'stockops-theme';
export const SIDEBAR_KEY = 'stockops-sidebar';

export const BOOT_SCRIPT =
  `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='mono')document.documentElement.dataset.theme=t;` +
  `if(localStorage.getItem('${SIDEBAR_KEY}')==='collapsed')document.documentElement.dataset.sidebar='collapsed'}catch(e){}`;
