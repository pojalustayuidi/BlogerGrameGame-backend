'use strict';
// Migration source equality treats Windows CRLF and Unix LF as the same text.
// SQL content changes must still be rejected. Do not edit stored DB checksums.
const {createHash} = require('node:crypto');
function digest(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}
function normalizeLineEndings(source) {
  return source.replace(/\r\n?/g, '\n');
}
function checksumForMigration(source) {
  // Stable across Windows/Linux for newly applied migrations.
  return digest(normalizeLineEndings(source));
}
function matchesAppliedChecksum(source, storedChecksum) {
  if (typeof storedChecksum !== 'string') return false;
  const normalized = normalizeLineEndings(source);
  const accepted = [
    // Historical versions stored a raw-file checksum (possibly LF or CRLF).
    digest(source),
    digest(normalized),
    digest(normalized.replace(/\n/g, '\r\n')),
  ];
  return accepted.includes(storedChecksum);
}
module.exports = {normalizeLineEndings, checksumForMigration, matchesAppliedChecksum};
