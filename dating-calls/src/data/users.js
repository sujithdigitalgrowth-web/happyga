/**
 * User phone registry.
 * Maps username → verified phone number.
 *
 * In production this would be a database lookup.
 * On a Twilio trial account every "To" number must be verified at
 * console.twilio.com → Phone Numbers → Verified Caller IDs.
 */
const userPhones = {
  ava24:     '+917032459601',
  mia26:     '+917032459601',
  sophia23:  '+917032459601',
  isla27:    '+917032459601',
  luna25:    '+917032459601',
  zoe22:     '+917032459601',
  emily28:   '+917032459601',
  nora24:    '+917032459601',
  grace26:   '+917032459601',
  hannah25:  '+917032459601',
};

function getPhoneByUsername(username) {
  return userPhones[String(username).toLowerCase()] || null;
}

function registerPhone(username, phone) {
  userPhones[String(username).toLowerCase()] = phone;
}

module.exports = { userPhones, getPhoneByUsername, registerPhone };
