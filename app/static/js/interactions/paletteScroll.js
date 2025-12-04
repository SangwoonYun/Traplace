/**
 * Palette scroll navigation for mobile
 */

export function setupPaletteScrollButtons() {
  const sidebar = document.getElementById('sidebar');
  const btnLeft = document.getElementById('paletteScrollLeft');
  const btnRight = document.getElementById('paletteScrollRight');
  
  if (!sidebar || !btnLeft || !btnRight) {
    console.warn('Palette scroll buttons: missing elements', { sidebar: !!sidebar, btnLeft: !!btnLeft, btnRight: !!btnRight });
    return;
  }
  
  const scrollAmount = 200; // pixels to scroll
  
  console.log('Sidebar dimensions:', {
    scrollWidth: sidebar.scrollWidth,
    clientWidth: sidebar.clientWidth,
    canScroll: sidebar.scrollWidth > sidebar.clientWidth,
    computedOverflow: window.getComputedStyle(sidebar).overflowX
  });
  
  // Prevent default to avoid any interference
  const handleScroll = (direction) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Before scroll:', {
        scrollLeft: sidebar.scrollLeft,
        scrollWidth: sidebar.scrollWidth,
        clientWidth: sidebar.clientWidth
      });
      
      const scrollValue = direction === 'left' ? -scrollAmount : scrollAmount;
      sidebar.scrollLeft += scrollValue;
      
      console.log('After scroll:', {
        scrollLeft: sidebar.scrollLeft,
        attempted: scrollValue
      });

    // Force update after scroll
    setTimeout(updateButtons, 100);
  };
  
  btnLeft.addEventListener('click', handleScroll('left'));
  btnLeft.addEventListener('touchend', handleScroll('left'));
  
  btnRight.addEventListener('click', handleScroll('right'));
  btnRight.addEventListener('touchend', handleScroll('right'));
  
  // Update button visibility based on scroll position
  const updateButtons = () => {
    const isAtStart = sidebar.scrollLeft <= 5;
    const isAtEnd = sidebar.scrollLeft >= sidebar.scrollWidth - sidebar.clientWidth - 5;
    
    btnLeft.style.opacity = isAtStart ? '0.3' : '1';
    btnLeft.style.pointerEvents = isAtStart ? 'none' : 'auto';
    
    btnRight.style.opacity = isAtEnd ? '0.3' : '1';
    btnRight.style.pointerEvents = isAtEnd ? 'none' : 'auto';
  };
  
  sidebar.addEventListener('scroll', updateButtons);
  updateButtons();
  
  console.log('Palette scroll buttons initialized');
}
