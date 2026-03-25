export function createBottomNav({ buttons, panels }) {
  let currentView = 'home';

  function switchView(view) {
    currentView = view;

    panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.view !== view);
    });

    buttons.forEach((button) => {
      const isActive = button.dataset.view === view;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      switchView(button.dataset.view);
    });
  });

  switchView(currentView);

  return {
    switchView,
  };
}