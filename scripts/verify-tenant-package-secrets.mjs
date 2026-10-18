import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyTenantPackageSecrets({ state, database, secretValues, check, evidence, expectedUsers = 2 }) {
  const secrets = [...secretValues].filter(value => typeof value === 'string' && value.length > 0);
  assert.ok(secrets.length >= 6);
  assert.ok(Number.isSafeInteger(expectedUsers) && expectedUsers > 0);
  const passwords = database('SELECT password FROM sys_user WHERE tenant_id=100001 AND deleted=0;').split('\n').map(value => value.trim()).filter(Boolean);
  check('本次验证账号数量准确且数据库密码均为BCrypt摘要', passwords.length === expectedUsers && passwords.every(value => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value))
    && passwords.every(value => !secrets.includes(value)));
  let files = 0;
  let bytes = 0;
  let leaks = 0;
  for (const service of ['auth', 'hr', 'oa', 'crm', 'workflow', 'gateway']) {
    const directory = path.join(state.run, service, 'logs');
    const names = await fs.readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const paths = [path.join(state.run, service, 'stdout.log'), path.join(state.run, service, 'stderr.log'),
      ...names.filter(name => name.endsWith('.log')).map(name => path.join(directory, name))];
    for (const file of paths) {
      const content = await fs.readFile(file, 'utf8');
      files++;
      bytes += Buffer.byteLength(content);
      leaks += secrets.filter(secret => content.includes(secret)).length;
    }
  }
  const audit = database("SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_name LIKE 'TENANT_PACKAGE_%' OR audit_name='PLATFORM_REAUTHENTICATION';");
  leaks += secrets.filter(secret => audit.includes(secret)).length;
  console.log(`H5_TENANT_PACKAGE_SECRET_SCAN: service_stdout_stderr=12; log_files=${files}; bytes=${bytes}; checked_values=${secrets.length}; audit_scanned=true; leaks=${leaks}`);
  check('六服务日志及套餐身份审计不含本次密码或会话令牌', leaks === 0);
  evidence.secrets = true;
}
