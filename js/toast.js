/**
 * Toast notification system
 */

const ICONS = {
  success: '✓',
  info: 'i',
  warning: '!',
  error: '×',
};

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-relevant', 'additions');
  document.body.appendChild(container);
  return container;
}

export function showToast(message, type = 'info', duration = 3200) {
  const root = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
    <span class="toast-message"></span>
    <button type="button" class="toast-close" aria-label="닫기">×</button>
  `;
  toast.querySelector('.toast-message').textContent = message;

  const remove = () => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  };

  toast.querySelector('.toast-close').addEventListener('click', remove);
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));

  if (duration > 0) {
    setTimeout(remove, duration);
  }

  return remove;
}
