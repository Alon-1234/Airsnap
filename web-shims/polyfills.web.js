/**
 * ============================================================
 *  AirSnap — web-only polyfills
 * ============================================================
 *  react-native-web ships Alert.alert as a no-op, which would
 *  silently swallow every confirm dialog in the app (abandon
 *  order, sign out, errors…). Replace it with a small in-page
 *  dialog that supports the same (title, message, buttons,
 *  options) signature, including cancel / destructive styles.
 *
 *  Native builds load polyfills.js (empty) instead of this file.
 * ============================================================
 */

import { Alert } from 'react-native';

const COLORS = {
  overlay: 'rgba(0,0,0,0.6)',
  card: '#1A1A2E',
  border: '#2E2E48',
  title: '#FFFFFF',
  message: '#A0A0B8',
  primary: '#0A84FF',
  cancel: '#A0A0B8',
  destructive: '#FF453A',
};

function makeButton(btn, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = btn.text || 'OK';
  const color =
    btn.style === 'destructive' ? COLORS.destructive
    : btn.style === 'cancel' ? COLORS.cancel
    : COLORS.primary;
  Object.assign(b.style, {
    flex: '1 1 auto',
    minWidth: '96px',
    padding: '12px 16px',
    borderRadius: '12px',
    border: `1px solid ${COLORS.border}`,
    background: btn.style === 'cancel' ? 'transparent' : 'rgba(255,255,255,0.04)',
    color,
    fontSize: '15px',
    fontWeight: btn.style === 'cancel' ? '500' : '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
  });
  b.addEventListener('click', onClick);
  return b;
}

function showAlert(title, message, buttons, options = {}) {
  if (typeof document === 'undefined') return;
  const list = Array.isArray(buttons) && buttons.length ? buttons : [{ text: 'OK' }];

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  if (title) overlay.setAttribute('aria-label', String(title));
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '100000',
    background: COLORS.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    width: '100%',
    maxWidth: '360px',
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '18px',
    padding: '20px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  });

  if (title) {
    const h = document.createElement('div');
    h.textContent = String(title);
    Object.assign(h.style, {
      color: COLORS.title, fontSize: '17px', fontWeight: '700', marginBottom: message ? '8px' : '16px',
    });
    card.appendChild(h);
  }
  if (message) {
    const p = document.createElement('div');
    p.textContent = String(message);
    Object.assign(p.style, {
      color: COLORS.message, fontSize: '14px', lineHeight: '20px', marginBottom: '18px',
      whiteSpace: 'pre-wrap',
    });
    card.appendChild(p);
  }

  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    flexDirection: list.length > 2 ? 'column' : 'row',
  });

  let closed = false;
  const close = (btn) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (btn) btn.onPress?.();
    else options.onDismiss?.();
  };
  const cancelBtn = list.find((b) => b.style === 'cancel');
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (cancelBtn) close(cancelBtn);
      else if (options.cancelable || list.length === 1) close(list.length === 1 ? list[0] : null);
    }
  }

  let primaryEl = null;
  list.forEach((btn) => {
    const el = makeButton(btn, () => close(btn));
    row.appendChild(el);
    if (btn.style !== 'cancel') primaryEl = el;
  });
  card.appendChild(row);
  overlay.appendChild(card);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && options.cancelable) close(cancelBtn || null);
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  (primaryEl || row.firstChild)?.focus?.();
}

Alert.alert = showAlert;
