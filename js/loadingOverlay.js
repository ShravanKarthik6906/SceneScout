// loadingOverlay.js – simple UI overlay for background processes
export function showLoading(message = 'Processing…') {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    const msg = document.createElement('div');
    msg.id = 'loading-message';
    msg.textContent = message;
    overlay.appendChild(spinner);
    overlay.appendChild(msg);
    document.body.appendChild(overlay);
  }
  overlay.querySelector('#loading-message').textContent = message;
  overlay.classList.remove('hidden');
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}
