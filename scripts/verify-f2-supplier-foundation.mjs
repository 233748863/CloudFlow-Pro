import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export async function verifyF2SupplierFoundation(ctx) {
  const { admin, other, outsider, readonly, employee, api, database, check, evidence, marker, quote, get, post, reject,
    today, shifted, month, createSupplier, supplier, changeSupplier, createCategory, qualifications,
    createQualification, saveQualification, verifyQualification, fourCriteria, saveCard, criteria, confirmCard, remember } = ctx;
  const root = await createCategory('主分类');
  const child = await createCategory('子分类', { parentId: root.categoryId });
  const grandchild = await createCategory('孙分类', { parentId: child.categoryId });
  const alternate = await createCategory('另一级');
  check('AC-2 分类三层路径完整', grandchild.levelPath === `/${root.categoryId}/${child.categoryId}/${grandchild.categoryId}/`);
  await post('/oa/supplier/categories', { ...child, parentId: alternate.categoryId });
  check('AC-2 分类移动同步修改子孙路径', (await get('/oa/supplier/categories')).find(value => value.categoryId === grandchild.categoryId).levelPath
    === `/${alternate.categoryId}/${child.categoryId}/${grandchild.categoryId}/`);
  const beforeCycle = await get('/oa/supplier/categories');
  const cycle = await api(admin, '/oa/supplier/categories', { method: 'POST', body: { ...alternate, parentId: grandchild.categoryId } });
  reject(cycle, 'AC-2 分类循环引用被拒绝', '分类不能循环引用');
  check('AC-2 循环引用返回明确400业务拒绝且分类树完整保持', cycle.status === 400 && cycle.body.code === 400
    && JSON.stringify(await get('/oa/supplier/categories')) === JSON.stringify(beforeCycle));
  reject(await api(admin, `/oa/supplier/categories/${child.categoryId}`, { method: 'DELETE' }), 'AC-2 有子分类时拒绝删除');
  const unused = await createCategory('删除分类');
  await api(admin, `/oa/supplier/categories/${unused.categoryId}`, { method: 'DELETE' }).then(result => ctx.successful(result, '删除空分类'));
  check('AC-2 分类删除实际保存且列表不再显示', database(`SELECT deleted FROM oa_supplier_category WHERE category_id=${unused.categoryId};`) === '1'
    && !(await get('/oa/supplier/categories')).some(value => value.categoryId === unused.categoryId));
  const foreignCategory = await createCategory('外租户分类', {}, outsider);
  const foreignParent = await api(admin, '/oa/supplier/categories', { method: 'POST', body: { ...root, parentId: foreignCategory.categoryId } });
  reject(foreignParent, 'AC-2 分类父级不能引用其他租户');
  evidence.categories = true;

  const fields = { categoryId: root.categoryId, shortName: '验证供应商', legalPerson: '验证法人', registerCapital: '1234567.89',
    registerDate: '2010-03-04', businessScope: '办公设备、耗材及维修服务', address: '独立验收园区1号', province: '浙江省', city: '杭州市',
    contactName: '验证联系人', contactPhone: '13800138000', contactEmail: 'supplier@example.invalid', taxNo: 'TAX' + marker,
    taxRate: '0.1300', paymentTerms: 'NET30', currency: 'CNY', cooperationStartDate: '2020-05-06', levelCode: 'A',
    bankName: '验证开户行', bankAccount: '6222000000000000', preventPurchaseFlag: 0, preventRfqFlag: 0 };
  const principal = await createSupplier('完整资料', { ...fields, score: '100.00', standing: 'EXCELLENT', blacklistFlag: 1,
    bypassFlag: 1, bypassExpireDate: shifted(365), qualificationExpireDate: shifted(3), instanceId: 'FORGED_' + marker });
  const displayFields = { ...fields, address: '独立验收园区****', contactPhone: '138****8000',
    contactEmail: 's***@example.invalid', bankAccount: '6222 **** 0000' };
  const storedPrivateFields = () => ctx.rows(`SELECT JSON_OBJECT('address',address,'contactPhone',contact_phone,
    'contactEmail',contact_email,'bankAccount',bank_account) FROM oa_supplier WHERE tenant_id=100000 AND supplier_id=${principal.supplierId};`)[0];
  const originalPrivateFields = Object.fromEntries(['address', 'contactPhone', 'contactEmail', 'bankAccount'].map(key => [key, fields[key]]));
  const initialPrivateFields = storedPrivateFields();
  for (const [key, value] of Object.entries(displayFields)) check('AC-1 真实保存回读字段 ' + key,
    ['registerCapital','taxRate'].includes(key) ? Number(principal[key]) === Number(value) : String(principal[key]) === String(value));
  check('AC-1 地址、电话、邮箱与银行账号完整保存且返回时隐藏敏感内容',
    Object.entries(initialPrivateFields).length === 4 && Object.entries(originalPrivateFields).every(([key, value]) => initialPrivateFields[key] === value));
  check('AC-1 普通新增不能伪造评分、黑名单、例外放行或审批事实', principal.score == null && principal.standing == null
    && principal.blacklistFlag === 0 && principal.bypassFlag === 0 && principal.qualificationExpireDate == null && principal.instanceId == null);
  const attempted = await api(admin, '/oa/supplier', { method: 'POST', body: { supplierName: marker + '_重复信用代码', creditCode: principal.creditCode.toLowerCase() } });
  reject(attempted, 'AC-1 同租户信用代码忽略大小写后仍拒绝重复');
  check('AC-1 重复信用代码没有增加供应商', database(`SELECT COUNT(*) FROM oa_supplier WHERE tenant_id=100000 AND credit_code=${quote(principal.creditCode)} AND deleted=0;`) === '1');
  const foreign = await createSupplier('外租户相同信用代码', { creditCode: principal.creditCode, status: 'DISABLED' }, outsider);
  check('AC-1 不同租户可使用相同信用代码', String(foreign.tenantId) === '100001');
  reject(await api(admin, '/oa/supplier/' + foreign.supplierId), 'AC-1 外租户供应商详情不可读取', '供应商不存在');
  reject(await api(outsider, '/oa/supplier/' + principal.supplierId), 'AC-1 供应商反向租户访问被拒绝', '供应商不存在');
  for (const [patch, message] of [[{ creditCode: 'SHORT' }, '统一社会信用代码应为18位字母数字'],
    [{ registerCapital: '-0.01' }, '注册资本超出精度或数值范围'], [{ registerCapital: '1000000000000.00' }, '注册资本超出精度或数值范围'],
    [{ taxRate: '1.0001' }, '税率不能超过1']]) {
    const before = await supplier(principal.supplierId);
    reject(await api(admin, '/oa/supplier', { method: 'PUT', body: { ...principal, ...patch } }), 'AC-1 信用代码或金额税率越界被拒绝', message);
    check('AC-1 非法字段被拒绝后原供应商完整保持', JSON.stringify(await supplier(principal.supplierId)) === JSON.stringify(before));
  }
  const edited = await changeSupplier(await supplier(principal.supplierId), { shortName: '资料已修改', standing: 'ELIMINATED', blacklistFlag: 1, bypassFlag: 1 });
  check('AC-1 更新保存资料且保持派生事实', edited.shortName === '资料已修改' && edited.standing == null && edited.blacklistFlag === 0 && edited.bypassFlag === 0);
  const preservedPrivateFields = storedPrivateFields();
  check('AC-1 将页面隐藏后的资料提交保存仍保持完整地址、电话、邮箱和银行账号',
    Object.entries(originalPrivateFields).every(([key, value]) => preservedPrivateFields[key] === value));
  reject(await api(admin, '/oa/supplier', { method: 'PUT', body: { ...principal, shortName: '旧页面覆盖' } }), 'AC-1 旧版本修改被拒绝', '记录已修改，请刷新后重试');
  check('AC-1 旧版本失败保留新页面已保存资料', JSON.stringify(await supplier(principal.supplierId)) === JSON.stringify(edited));
  reject(await api(admin, `/oa/supplier/categories/${root.categoryId}`, { method: 'DELETE' }), 'AC-2 供应商引用分类时拒绝删除');
  const removed = await createSupplier('删除供应商');
  ctx.successful(await api(admin, '/oa/supplier/' + removed.supplierId, { method: 'DELETE' }), '实际删除无引用供应商');
  check('AC-1 供应商删除标记真实保存且列表不再出现', database(`SELECT deleted FROM oa_supplier WHERE supplier_id=${removed.supplierId};`) === '1'
    && !(await get('/oa/supplier/list?supplierName=' + encodeURIComponent(removed.supplierName))).records.some(value => value.supplierId === removed.supplierId));
  reject(await api(admin, '/oa/supplier/' + removed.supplierId), 'AC-1 已删除供应商不可读取', '供应商不存在');
  reject(await api(readonly, '/oa/supplier', { method: 'POST', body: { supplierName: marker + '_越权新增' } }), 'AC-1 无管理权限账号不能新增供应商');
  evidence.profile = true; evidence.deletion = true; evidence.permissions = true;
  ctx.principal = await supplier(principal.supplierId); ctx.category = root;

  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlXQAAAAASUVORK5CYII=', 'base64');
  const fileName = marker + '_资质扫描件.png';
  const file = ctx.successful(await api(admin, '/auth/system/file/upload', { method: 'POST', file: { name: fileName, content: bytes.toString('base64'), type: 'image/png' } }), 'AC-3 真实上传资质扫描件');
  const qualification = await createQualification(principal, '营业执照', { fileUrl: file.url, expireDate: shifted(7) });
  check('AC-3 资质新建为待核验并保留真实扫描件引用', qualification.verifyStatus === 'PENDING' && qualification.fileUrl === file.url);
  const refused = await verifyQualification(qualification, false, marker + '_号码不清晰');
  check('AC-3 不通过保留原因和真实核验人时间', refused.verifyStatus === 'REJECTED' && refused.rejectReason === marker + '_号码不清晰'
    && String(refused.verifyBy) === '990000701' && refused.verifyTime);
  const verified = await verifyQualification(refused, true);
  check('AC-3 重新通过清空旧拒绝原因', verified.verifyStatus === 'VERIFIED' && verified.rejectReason == null);
  check('AC-5 首个有效资质到期日回填', (await supplier(principal.supplierId)).qualificationExpireDate === shifted(7));
  const earlier = await verifyQualification(await createQualification(principal, '更早认证', { qualificationType: 'ISO', expireDate: shifted(3) }));
  check('AC-5 多资质取最早有效到期日', (await supplier(principal.supplierId)).qualificationExpireDate === shifted(3));
  const longTerm = await saveQualification({ ...earlier, longTermFlag: 1 });
  check('AC-3/5 改为长期清空到期日和旧核验状态', longTerm.expireDate == null && longTerm.verifyStatus === 'PENDING'
    && longTerm.verifyBy == null && longTerm.verifyTime == null && (await supplier(principal.supplierId)).qualificationExpireDate === shifted(7));
  await verifyQualification(longTerm);
  const pending = await saveQualification({ ...verified, certNo: marker + '_已更新' });
  check('AC-3/5 已核验资质编辑后须重新核验且清空主数据到期日', pending.verifyStatus === 'PENDING' && pending.verifyBy == null
    && pending.verifyTime == null && (await supplier(principal.supplierId)).qualificationExpireDate == null);
  const current = await verifyQualification(pending);
  reject(await api(employee, `/oa/supplier/qualifications/${current.qualificationId}/verify`, { method: 'POST', body: { accepted: true } }), 'AC-3 普通员工不能核验资质');
  reject(await api(outsider, `/oa/supplier/${principal.supplierId}/qualifications`), 'AC-3 外租户不能读取资质');
  reject(await api(admin, '/oa/supplier/' + principal.supplierId, { method: 'DELETE' }), 'AC-3 已被资质引用的供应商不能删除');
  const request = { bizType: 'OA_SUPPLIER_QUALIFICATION', bizId: String(principal.supplierId), childId: current.qualificationId, fileId: file.fileId };
  const ticket = await post('/auth/system/file/preview-ticket', request);
  check('AC-3 实际资质预览返回原文件信息', ticket.supported === true && ticket.fileName === fileName && ticket.size === bytes.length);
  const tokens = new URL(ticket.streamUrl, 'http://127.0.0.1').searchParams;
  await remember(tokens.get('previewToken')); await remember(tokens.get('signature'));
  const downloaded = await api(admin, ticket.streamUrl.slice(4));
  check('AC-3 资质文件实际字节保持且禁止缓存', downloaded.status === 200 && downloaded.size === bytes.length
    && downloaded.sha256 === createHash('sha256').update(bytes).digest('hex') && downloaded.cacheControl?.includes('no-store'));
  reject(await api(outsider, '/auth/system/file/preview-ticket', { method: 'POST', body: request }), 'AC-3 外租户不能申请扫描件预览');
  reject(await api(employee, '/auth/system/file/preview-ticket', { method: 'POST', body: request }), 'AC-3 无供应商查看权限不能预览扫描件');
  const sessionTicket = await post('/auth/system/file/preview-ticket', request);
  const sessionTokens = new URL(sessionTicket.streamUrl, 'http://127.0.0.1').searchParams;
  await remember(sessionTokens.get('previewToken')); await remember(sessionTokens.get('signature'));
  const foreignPreview = await api(other, sessionTicket.streamUrl.slice(4));
  check('AC-3 他人会话不能重用资质预览凭据', foreignPreview.status === 410 && foreignPreview.body?.code === 410
    && foreignPreview.body.msg === '预览凭据已失效，请重新打开附件');
  const ownPreview = await api(admin, sessionTicket.streamUrl.slice(4));
  check('AC-3 他人访问被拒绝后本人凭据仍有效且文件完整', ownPreview.status === 200 && ownPreview.size === bytes.length
    && ownPreview.sha256 === createHash('sha256').update(bytes).digest('hex') && ownPreview.cacheControl?.includes('no-store'));
  evidence.files = true; evidence.qualifications = true; evidence.earliestExpiry = true;
  ctx.qualification = current; ctx.qualificationFile = { ...file, name: fileName, size: bytes.length };

  const scoring = await createSupplier('评分编辑');
  const items = fourCriteria('80.00');
  const period = month(-1);
  reject(await api(admin, '/oa/supplier/scorecards', { method: 'POST', body: { scorecard: { supplierId: scoring.supplierId,
    periodType: 'MONTHLY', periodStart: period.start, periodEnd: period.end }, criteria: items.map((value, index) => index === 0 ? { ...value, weight: '0.4' } : value) } }), 'AC-6 权重合计不为1时保存被拒绝');
  let saved = await saveCard(scoring, period, items);
  check('AC-6/7 四维总分和档位真实保存', saved.status === 'DRAFT' && Number(saved.totalScore) === 80 && saved.standing === 'QUALIFIED');
  const original = await criteria(saved.scorecardId);
  saved = await saveCard(scoring, period, original.filter(value => value.criteriaCode !== 'SERVICE').map(value => value.criteriaCode === 'PRICE' ? { ...value, weight: '0.4' } : value), saved);
  check('AC-6 实际移除评分维度后读取只剩三项', (await criteria(saved.scorecardId)).length === 3);
  saved = await saveCard(scoring, period, original, saved);
  const restored = await criteria(saved.scorecardId);
  check('AC-6 恢复评分维度复用原编号', restored.length === 4 && original.every(value => restored.some(row => row.criteriaCode === value.criteriaCode && row.criteriaId === value.criteriaId)));
  reject(await api(outsider, `/oa/supplier/scorecards/${saved.scorecardId}/criteria`), 'AC-6 外租户不能读取评分维度');
  await confirmCard(saved);
  check('AC-9 确认后回填评分和颜色', Number((await supplier(scoring.supplierId)).score) === 80 && (await supplier(scoring.supplierId)).indicatorColor === 'GREEN');
  reject(await api(admin, '/oa/supplier/scorecards', { method: 'POST', body: { scorecard: saved, criteria: items } }), 'AC-6 已确认评分不可修改');
  reject(await api(employee, `/oa/supplier/scorecards/${saved.scorecardId}/confirm`, { method: 'POST', body: {} }), 'AC-9 普通员工不能确认评分');
  evidence.weights = true; evidence.scoring = true; evidence.confirmation = true;
  ctx.scoringSupplier = scoring; ctx.confirmedCard = saved;
}
