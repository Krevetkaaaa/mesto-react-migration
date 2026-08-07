const SECURITY_HEADERS = Object.freeze(require('../config/security-headers.json'));

function setSecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

module.exports = { SECURITY_HEADERS, setSecurityHeaders };
