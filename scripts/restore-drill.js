'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Self-contained AES-256-GCM backup/restore drill helper.
 * Verifies encryption, integrity manifest, decryption, and full SQL/data restoration
 * into a disposable fresh database while measuring RTO (Restore Time Objective).
 */
const DEFAULT_SAMPLE_SQL = `
  CREATE TABLE restore_drill_check (id int primary key, label text not null, amount_vnd bigint not null);
  INSERT INTO restore_drill_check VALUES (1, 'SL-1001', 120000), (2, 'SL-1002', 29000);
`;

async function runLogicalRestoreDrill({ encryptKeyHex, sampleSql = DEFAULT_SAMPLE_SQL } = {}) {
  const startMs = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slink-restore-drill-'));
  const backupPath = path.join(tmpDir, 'drill.slinkbackup.enc');
  const manifestPath = path.join(tmpDir, 'drill.slinkbackup.manifest.json');
  try {
    const key = Buffer.from(encryptKeyHex || crypto.randomBytes(32).toString('hex'), 'hex');
    if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars).');
    const plain = Buffer.from(sampleSql, 'utf8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]);
    fs.writeFileSync(backupPath, payload);

    const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
    const manifest = {
      schemaVersion: 1,
      algorithm: 'aes-256-gcm',
      backupFile: path.basename(backupPath),
      sizeBytes: payload.length,
      sha256,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Verify manifest & checksum
    const raw = fs.readFileSync(backupPath);
    const actualHash = crypto.createHash('sha256').update(raw).digest('hex');
    if (actualHash !== manifest.sha256) throw new Error('Backup checksum mismatch.');

    // Decrypt & verify GCM authentication tag
    const decIv = raw.subarray(0, 12);
    const decTag = raw.subarray(12, 28);
    const decBody = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, decIv);
    decipher.setAuthTag(decTag);
    const restoredSql = Buffer.concat([decipher.update(decBody), decipher.final()]).toString('utf8');

    const { PGlite } = await import('@electric-sql/pglite');
    const targetDb = new PGlite();
    await targetDb.exec(restoredSql);
    const check = await targetDb.query('SELECT COUNT(*)::int AS cnt FROM restore_drill_check');
    await targetDb.close();

    return {
      ok: true,
      restoredRows: Number(check.rows[0]?.cnt || 0),
      sha256: actualHash,
      rtoMs: Date.now() - startMs,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const sampleSql = `
    CREATE TABLE restore_drill_check (id int primary key, label text not null, amount_vnd bigint not null);
    INSERT INTO restore_drill_check VALUES (1, 'SL-1001', 120000), (2, 'SL-1002', 29000);
  `;
  runLogicalRestoreDrill({ sampleSql })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok || report.restoredRows !== 2) process.exit(1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runLogicalRestoreDrill };
