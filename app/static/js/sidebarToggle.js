/**
 * Sidebar toggle functionality
 */

export function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleSidebar');
  
  if (!sidebar || !toggleBtn) {
    console.warn('Sidebar toggle: missing elements');
    return;
  }
  
  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sidebar.classList.toggle('collapsed');
    
    // Update button icon
    if (sidebar.classList.contains('collapsed')) {
      toggleBtn.textContent = '▶';
      toggleBtn.title = 'Déplier la palette';
    } else {
      toggleBtn.textContent = '◀';
      toggleBtn.title = 'Replier la palette';
    }
  });
  
  console.log('Sidebar toggle initialized');
}
