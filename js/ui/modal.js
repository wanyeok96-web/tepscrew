/**
 * Simple accessible modal helpers
 */

export function showConfirmModal({
  title = '확인',
  message = '',
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${escape(title)}</h2>
        <p class="modal-message">${escape(message)}</p>
        <div class="btn-row wrap modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">${escape(cancelLabel)}</button>
          <button type="button" class="btn ${
            danger ? 'btn-danger' : 'btn-primary'
          }" data-act="ok">${escape(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const focusBtn = overlay.querySelector('[data-act="ok"]');
    focusBtn?.focus();

    const close = (val) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
  });
}

function escape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function setLoading(btn, loading, loadingText = '처리 중…') {
  if (!btn) return;
  if (loading) {
    btn.dataset.prevLabel = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.textContent = loadingText;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    if (btn.dataset.prevLabel) btn.textContent = btn.dataset.prevLabel;
  }
}
