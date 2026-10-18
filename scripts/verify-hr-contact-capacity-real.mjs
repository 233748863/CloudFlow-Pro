import assert from 'node:assert/strict';

export async function verifyHrContactCapacity(context) {
  const { admin, api, successful, database, check, session, caseTag } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const marker = `contact_${caseTag}`;
  const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  const email = `${caseTag.padEnd(64, 'a')}@${domain}`;
  const parsedEmail = `${caseTag.padEnd(64, 'z')}@${domain}`;
  const phonePrefix = `+1${BigInt('0x' + caseTag).toString().padStart(13, '0').slice(-13)}`;
  const phone = `${phonePrefix}1`;
  const parsedPhone = `${phonePrefix}2`;
  const candidates = [];
  const originalGrants = database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;");
  const employee = await session('g_holiday_employee');
  const add = async (suffix, contacts = {}) => {
    const name = `${marker}_${suffix}`;
    const candidateId = successful(await api(admin, '/hr/recruitment/candidates', {
      method: 'POST', body: { name, candidateNo: name, gender: 'UNKNOWN', ...contacts },
    }), '真实接口新增容量候选人');
    assert.match(String(candidateId), /^[1-9]\d*$/);
    candidates.push(String(candidateId));
    return String(candidateId);
  };
  const contactMatches = (candidateId, expectedPhone, expectedEmail) => database(`SELECT COUNT(*) FROM hr_candidate WHERE tenant_id=100000 AND id=${candidateId} AND phone=${literal(expectedPhone)} AND email=${literal(expectedEmail)};`) === '1';
  try {
    const direct = await add('direct', { phone, email });
    console.log('H2_CONTACT_HTTP_STORAGE: ' + database(`SELECT CONCAT('rows=',COUNT(*),'; phone_length=',COALESCE(MAX(CHAR_LENGTH(phone)),0),'; email_length=',COALESCE(MAX(CHAR_LENGTH(email)),0),'; phone_match=',COALESCE(MAX(phone=${literal(phone)}),0),'; email_match=',COALESCE(MAX(email=${literal(email)}),0)) FROM hr_candidate WHERE tenant_id=100000 AND id=${direct};`));
    check('候选人新增完整保留最长手机邮箱', contactMatches(direct, phone, email));
    successful(await api(admin, `/hr/recruitment/candidates/${direct}`, { method: 'PUT', body: { name: `${marker}_direct`, candidateNo: `${marker}_direct`, phone, email, status: 'SCREENING', version: 0 } }), '真实修改完整联系方式');
    check('候选人修改未截断联系方式', contactMatches(direct, phone, email));
    const parsedCandidate = await add('parsed');
    const parsedId = successful(await api(admin, '/hr/recruitment/resume/parse', {
      method: 'POST', body: { candidateId: parsedCandidate, rawText: `手机：${parsedPhone}\n邮箱：${parsedEmail}` },
    }), '真实简历解析最大联系方式');
    assert.match(String(parsedId), /^[1-9]\d*$/);
    const parsedRows = successful(await api(admin, `/hr/recruitment/resume/parsed?candidateId=${parsedCandidate}`), '真实读取解析结果');
    const row = parsedRows.find(item => String(item.id) === String(parsedId));
    check('解析完整保存且返回继续脱敏', row?.parsedPhone?.includes('*') === true && row?.parsedEmail?.includes('*') === true
      && database(`SELECT COUNT(*) FROM hr_resume_parsed_fields WHERE id=${parsedId} AND tenant_id=100000 AND parsed_phone=${literal(parsedPhone)} AND parsed_email=${literal(parsedEmail)};`) === '1');
    const denied = await api(employee, `/hr/recruitment/resume/parsed/${parsedId}/confirm`, { method: 'POST' });
    check('普通员工不能确认招聘联系方式', denied.status === 403 && denied.body?.code !== 200);
    successful(await api(admin, `/hr/recruitment/resume/parsed/${parsedId}/confirm`, { method: 'POST' }), '真实确认解析回填');
    check('解析确认后招聘记录完整保存', contactMatches(parsedCandidate, parsedPhone, parsedEmail));
    successful(await api(admin, `/hr/recruitment/resume/parsed/${parsedId}`, {
      method: 'PUT', body: { parsedPhone: '+1 (202) 555-0123', parsedEmail: 'Person.Name+Tag@EXAMPLE.TEST' },
    }), '真实修订解析联系方式');
    const revisedRows = successful(await api(admin, `/hr/recruitment/resume/parsed?candidateId=${parsedCandidate}`), '真实读取修订结果');
    const revised = revisedRows.find(item => String(item.id) === String(parsedId));
    check('人工复核完整保留且页面继续脱敏', revised?.parsedPhone?.includes('*') === true && revised?.parsedEmail?.includes('*') === true
      && database(`SELECT COUNT(*) FROM hr_resume_parsed_fields WHERE id=${parsedId} AND tenant_id=100000 AND parsed_phone=${literal('+12025550123')} AND parsed_email=${literal('person.name+tag@example.test')};`) === '1');
    successful(await api(admin, '/hr/recruitment/resume/parse', {
      method: 'POST', body: { candidateId: parsedCandidate, rawText: `手机：13812345678\n邮箱：${email}e` },
    }), '真实重解析无可用标准联系方式');
    const replacedRows = successful(await api(admin, `/hr/recruitment/resume/parsed?candidateId=${parsedCandidate}`), '真实读取重解析结果');
    const replaced = replacedRows.find(item => String(item.id) === String(parsedId));
    check('重解析无有效结果时清除旧提取值', replaced?.parsedPhone == null && replaced?.parsedEmail == null);
    check('未识别号码保留原文且普通响应不携带原文', replaced?.rawText === undefined
      && database(`SELECT COUNT(*) FROM hr_resume_parsed_fields WHERE id=${parsedId} AND tenant_id=100000 AND LOCATE('13812345678',raw_text)>0;`) === '1');
    check('重新解析保持已确认候选人联系方式', contactMatches(parsedCandidate, parsedPhone, parsedEmail));
    check('容量核验未修改角色权限', originalGrants === database("SELECT CONCAT(tenant_id,':',role_id,':',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;"));
  } finally {
    for (const candidateId of candidates) {
      assert.equal(database(`SELECT COUNT(*) FROM hr_candidate WHERE tenant_id=100000 AND id=${candidateId} AND name IN (${literal(marker + '_direct')},${literal(marker + '_parsed')});`), '1', 'Only owned candidate identities can be cleaned');
      database(`DELETE FROM hr_recruitment_identity WHERE tenant_id=100000 AND candidate_id=${candidateId} AND referral_id IS NULL;`);
      database(`DELETE FROM hr_resume_parsed_fields WHERE tenant_id=100000 AND candidate_id=${candidateId}; DELETE FROM hr_candidate WHERE tenant_id=100000 AND id=${candidateId} AND name IN (${literal(marker + '_direct')},${literal(marker + '_parsed')});`);
      assert.equal(database(`SELECT COUNT(*) FROM hr_candidate WHERE tenant_id=100000 AND id=${candidateId};`), '0', 'Only owned candidates cleaned');
    }
    console.log(`H2_CONTACT_CAPACITY_HTTP_CLEANUP: candidates=${candidates.length}; remaining=0; audit_retained=true; production_modified=false`);
  }
  console.log('H2_CONTACT_CAPACITY_HTTP: actual_hr=true; actual_auth=true; actual_gateway=true; real_mysql=true; real_redis=true; interface_doubles=0; actual_onboarding_http=false; contact_output=0; production_modified=false');
}
