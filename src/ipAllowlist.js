'use strict';

const net = require('node:net');

// Bygger en net.BlockList ud fra "1.2.3.4", "1.2.3.0/24", "2001:db8::/32" osv.
function buildList(entries) {
  const list = new net.BlockList();
  for (const entry of entries) {
    const [addr, prefix] = entry.split('/');
    const type = net.isIPv6(addr) ? 'ipv6' : net.isIPv4(addr) ? 'ipv4' : null;
    if (!type) throw new Error(`ALLOWED_IPS: ugyldig adresse "${entry}"`);
    if (prefix === undefined) {
      list.addAddress(addr, type);
    } else {
      const bits = Number(prefix);
      const max = type === 'ipv4' ? 32 : 128;
      if (!Number.isInteger(bits) || bits < 0 || bits > max) {
        throw new Error(`ALLOWED_IPS: ugyldig netmaske i "${entry}"`);
      }
      list.addSubnet(addr, bits, type);
    }
  }
  return list;
}

function normalize(ip) {
  // IPv4 mappet ind i IPv6 (::ffff:1.2.3.4) behandles som IPv4.
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip || '');
  return m ? m[1] : ip;
}

// Afviser alle klienter, hvis IP ikke er på listen. req.ip er den rigtige klient-IP,
// fordi 'trust proxy' = 1 og NGINX er eneste vej ind (Node.js-noden har ingen offentlig IP).
function ipAllowlist(entries) {
  if (!entries.length) return (req, res, next) => next();
  const list = buildList(entries);
  return (req, res, next) => {
    const ip = normalize(req.ip);
    const type = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
    if (ip && net.isIP(ip) && list.check(ip, type)) return next();
    console.warn(`Afvist af IP-spærring: ${ip} ${req.method} ${req.originalUrl}`);
    res.status(403).type('text').send(`Adgang nægtet. Din IP-adresse (${ip}) har ikke adgang.`);
  };
}

module.exports = { ipAllowlist, buildList };
