export function createCoinsModal({
  triggerButton,
  modal,
  closeButton,
  modalCard,
  planButtons,
  selectedPlanText,
  buyButton,
  onBuy,
}) {
  let selectedPlan = {
    coins: '50',
    price: '20',
  };

  function open() {
    modal.classList.remove('hidden');
  }

  function close(event) {
    if (event) {
      event.stopPropagation();
    }

    modal.classList.add('hidden');
  }

  function updateSelectedPlan(planButton) {
    selectedPlan = {
      coins: planButton.dataset.coins,
      price: planButton.dataset.price,
    };

    planButtons.forEach((button) => {
      const isSelected = button === planButton;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    selectedPlanText.textContent = `Selected: ${selectedPlan.coins} Coins for ₹${selectedPlan.price}`;
  }

  triggerButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  modal.addEventListener('click', close);
  modalCard.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  planButtons.forEach((button) => {
    button.addEventListener('click', () => {
      updateSelectedPlan(button);
    });
  });

  buyButton.addEventListener('click', async () => {
    await onBuy({
      coins: Number(selectedPlan.coins),
      price: Number(selectedPlan.price),
    });
    close();
  });

  updateSelectedPlan(planButtons[0]);
}