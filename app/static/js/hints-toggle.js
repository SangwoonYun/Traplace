/**
 * Hints Toggle Module
 * Manages the display of usage hints in a modal for mobile devices
 */

export function initHintsToggle() {
  const toggleBtn = document.getElementById('toggleHints');
  const hintsModal = document.getElementById('hintsModal');
  const closeBtn = document.querySelector('.hints-modal-close');

  if (!toggleBtn || !hintsModal) return;

  // Open modal
  toggleBtn.addEventListener('click', () => {
    hintsModal.classList.add('active');
  });

  // Close modal via close button
  closeBtn?.addEventListener('click', () => {
    hintsModal.classList.remove('active');
  });

  // Close modal by clicking outside content
  hintsModal.addEventListener('click', (e) => {
    if (e.target === hintsModal) {
      hintsModal.classList.remove('active');
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hintsModal.classList.contains('active')) {
      hintsModal.classList.remove('active');
    }
  });
}
