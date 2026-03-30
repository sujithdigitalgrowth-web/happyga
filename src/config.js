function normalizeUrl(raw, fallback) {
  if (!raw) return fallback;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DEFAULT_STARTING_COINS: Number(process.env.HAPPYGA_DEFAULT_COINS || 50),
  CALL_COST_COINS: Number(process.env.HAPPYGA_CALL_COST_COINS || 6),
  LISTENER_PAYOUT_RATE: Number(process.env.HAPPYGA_LISTENER_PAYOUT_RATE || 0.4),
  CALL_SERVER_URL: normalizeUrl(process.env.CALL_SERVER_URL, 'http://localhost:3001'),
};
