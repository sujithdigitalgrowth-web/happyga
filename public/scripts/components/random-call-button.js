export function initRandomCallButton({ button, getCallButtons, showHomeView }) {
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    showHomeView();

    const callButtons = getCallButtons();
    if (!callButtons.length) {
      alert('No available users for random call right now.');
      return;
    }

    const randomIndex = Math.floor(Math.random() * callButtons.length);
    const selectedButton = callButtons[randomIndex];

    button.classList.add('is-calling');
    button.setAttribute('aria-busy', 'true');

    setTimeout(() => {
      selectedButton.click();
      button.classList.remove('is-calling');
      button.removeAttribute('aria-busy');
      button.blur();
    }, 120);
  });
}