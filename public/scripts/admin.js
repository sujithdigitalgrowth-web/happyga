async function loadAdminWithdrawals() {
  const res = await fetch('/api/withdrawals/admin');
  const data = await res.json();

  const list = document.getElementById('adminWithdrawalList');
  list.innerHTML = '';

  if (!data.requests || data.requests.length === 0) {
    list.innerHTML = '<li>No pending requests</li>';
    return;
  }

  data.requests.forEach((w) => {
    const li = document.createElement('li');
    li.textContent = `${w.listenerId} | \u20b9${w.amount} | ${w.upiId}`;
    list.appendChild(li);
  });
}

loadAdminWithdrawals();
