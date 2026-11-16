'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {checksumForMigration, matchesAppliedChecksum, normalizeLineEndings} = require('../lib/migrationChecksum');
function digest(s) { return createHash('sha256').update(s).digest('hex'); }

test('migration source with CRLF and LF has the same canonical checksum', () => {
  const unix = 'CREATE TABLE sample(id INT);\n-- comment\n';
  const windows = unix.replace(/\n/g, '\r\n');
  assert.equal(checksumForMigration(unix), checksumForMigration(windows));
  assert.equal(normalizeLineEndings(windows), unix);
});

test('existing migrations with historic LF or CRLF raw checksums both remain valid', () => {
  const unix = 'CREATE TABLE example(id INT);\n';
  const windows = unix.replace(/\n/g, '\r\n');
  assert.ok(matchesAppliedChecksum(windows, digest(unix)));
  assert.ok(matchesAppliedChecksum(unix, digest(windows)));
  assert.ok(matchesAppliedChecksum(unix, digest(unix)));
});

test('real SQL changes are still rejected', () => {
  const source = 'CREATE TABLE example(id INT);\n';
  const modified = 'CREATE TABLE example(id BIGINT);\n';
  assert.equal(matchesAppliedChecksum(modified, digest(source)), false);
  assert.equal(matchesAppliedChecksum(modified, 'not-a-sha256'), false);
});

test('stage 03 guest migration is accepted after Windows line-ending conversion', () => {
  const filename = path.join(__dirname, '..', 'db', 'migrations', '002_guest_sessions.sql');
  const unix = normalizeLineEndings(fs.readFileSync(filename,'utf8'));
  const windows = unix.replace(/\n/g,'\r\n');
  assert.ok(matchesAppliedChecksum(windows, digest(unix)));
});
