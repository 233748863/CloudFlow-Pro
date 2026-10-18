import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { previewDigest, previewPause, previewPdf, previewSql } from './file-preview-fixtures.mjs';

export async function verifyPreviewFileBoundaries(context) {
  const { actor, files, cases, records, images, upload, uploadRaw, issue, issueRaw, read, verifyBytes, denied, database, check, directory, caseTag, redis, evidence } = context;
  for (const format of ['png', 'jpeg', 'gif', 'webp']) {
    const file = await upload(actor, `format.${format}`, Buffer.from(images[format], 'base64'), `image/${format}`);
    await verifyBytes(actor, await issue(actor, { bizType: 'PUBLIC', fileId: file.id }, `实际${format}图片`), file, `实际${format}图片`);
  }
  for (const [name, bytes] of [['html', Buffer.from('<!DOCTYPE html><script>alert(1)</script>')],
    ['png', Buffer.from(images.png, 'base64')], ['truncated', Buffer.from('RIFF0000WEBPVP8 ')]]) {
    const suffix = `disguised-${name}.webp`;
    const response = await uploadRaw(actor, suffix, bytes, 'image/webp');
    check(`实际上传拒绝${name}冒充WebP且未创建附件记录`, response.status === 200 && response.body?.code === 500 && response.body?.data == null
      && database(`SELECT COUNT(*) FROM sys_file WHERE file_name=${previewSql(`h5p_${caseTag}_${suffix}`)};`) === '0');
  }
  const ticket = await issue(actor, cases[0].request, '真实分段读取');
  for (const [header, start, end] of [['bytes=0-4', 0, 4], ['bytes=5-', 5, files.public.bytes.length - 1],
    ['bytes=-8', files.public.bytes.length - 8, files.public.bytes.length - 1], ['bytes=0-999999', 0, files.public.bytes.length - 1]]) {
    const result = await read(actor, ticket, { headers: { Range: header } });
    check(`${header}返回精确单段原始字节及Content-Range`, result.status === 206
      && result.size === end - start + 1 && result.sha256 === previewDigest(files.public.bytes.subarray(start, end + 1))
      && result.contentRange === `bytes ${start}-${end}/${files.public.bytes.length}` && result.cacheControl?.includes('no-store'));
  }
  for (const header of ['bytes=0-1,4-5', 'bytes=999999-', 'bytes=-0', 'bytes=4-3', 'items=0-1', 'bytes=abc-def']) {
    const result = await read(actor, ticket, { headers: { Range: header } });
    check(`${header}拒绝非法或多段范围且无附件内容`, result.status === 416 && result.size === 0 && result.contentRange === `bytes */${files.public.bytes.length}`);
  }
  const head = await read(actor, ticket, { method: 'HEAD' });
  check('HEAD同样校验凭据但不传输正文', head.status === 200 && head.size === 0 && head.contentType === 'application/pdf');
  evidence.ranges = true;
  const expiry = await issue(actor, cases[0].request, '实际60秒到期');
  const expiryIdentifier = new URL(expiry.streamUrl, 'http://127.0.0.1').searchParams.get('previewToken');
  const expiryKey = `auth:file-preview:v1:${previewDigest(expiryIdentifier)}`;
  const initialTtl = Number(redis('TTL', expiryKey));
  check('真实Redis预览凭据初始有效期为59或60秒', initialTtl >= 59 && initialTtl <= 60);
  const contract = cases.find(candidate => candidate.name === 'contract');
  const linked = await issue(actor, contract.request, '业务引用撤回');
  database(`UPDATE oa_contract SET attachment_url=NULL WHERE contract_id=${records.contractId};`);
  try { denied(await read(actor, linked, { headers: { Range: 'bytes=0-4' } }), '每次Range读取重新验证业务附件仍在当前记录内'); }
  finally { database(`UPDATE oa_contract SET attachment_url=${previewSql(files.contract.reference)} WHERE contract_id=${records.contractId};`); }
  const historical = cases.find(candidate => candidate.name === 'history');
  const historyTicket = await issue(actor, historical.request, '历史版本撤回');
  database(`UPDATE oa_knowledge_doc_version SET deleted=1 WHERE id=${records.versionId};`);
  try { denied(await read(actor, historyTicket), '已删除历史版本不能继续使用既有预览签名'); }
  finally { database(`UPDATE oa_knowledge_doc_version SET deleted=0 WHERE id=${records.versionId};`); }
  denied(await issueRaw(actor, { ...historical.request, versionNo: 2 }), '未存在的知识版本不能借用旧版本附件');
  const removed = await issue(actor, cases[0].request, '真实文件删除');
  database(`UPDATE sys_file SET deleted=1 WHERE file_id=${files.public.id};`);
  try { denied(await read(actor, removed), '文件删除后旧签名不能继续读取'); }
  finally { database(`UPDATE sys_file SET deleted=0 WHERE file_id=${files.public.id};`); }
  const originalBytes = previewPdf(`owned-boundary-${caseTag}`);
  const boundary = await upload(actor, 'boundary.pdf', originalBytes);
  const original = JSON.parse(database(`SELECT JSON_OBJECT('path',file_path,'name',file_name,'extension',file_type,'size',file_size,'hash',file_hash,'tenant',tenant_id,'creator',create_by)
    FROM sys_file WHERE file_id=${boundary.id};`));
  const profile = await fs.realpath(path.join(directory, 'profile'));
  const target = await fs.realpath(path.isAbsolute(original.path) && /^[a-z]:/i.test(original.path)
    ? original.path : path.join(profile, original.path.replace(/^[/\\]+/, '')));
  assert.ok(target.startsWith(profile + path.sep), 'Only current isolated profile file bytes may be modified');
  assert.equal(original.tenant, 100000);
  assert.equal(original.creator, context.person.username);
  assert.equal(database(`SELECT COUNT(*) FROM sys_file WHERE file_path=${previewSql(original.path)} AND deleted=0;`), '1', 'Boundary bytes must not be shared with another file');
  assert.equal(previewDigest(await fs.readFile(target)), boundary.digest);
  const boundaryRequest = { bizType: 'PUBLIC', fileId: boundary.id };
  const updateBytes = async (bytes, fileName = boundary.name, extension = 'pdf') => {
    await fs.writeFile(target, bytes);
    database(`UPDATE sys_file SET file_name=${previewSql(fileName)},file_type=${previewSql(extension)},file_size=${bytes.length},file_hash=${previewSql(previewDigest(bytes))}
      WHERE file_id=${boundary.id} AND tenant_id=100000 AND create_by=${previewSql(context.person.username)};`);
  };
  try {
    const maxBytes = 20 * 1024 * 1024;
    const exact = Buffer.alloc(maxBytes, 32);
    originalBytes.copy(exact);
    await updateBytes(exact);
    const exactTicket = await issue(actor, boundaryRequest, '真实20MiB文件');
    const exactResult = await read(actor, exactTicket);
    check('真实20MiB附件允许预览且完整字节一致', exactTicket.supported && exactTicket.size === maxBytes
      && exactResult.status === 200 && exactResult.size === maxBytes && exactResult.sha256 === previewDigest(exact));
    await updateBytes(Buffer.concat([exact, Buffer.from(' ')]));
    const oversized = await issue(actor, boundaryRequest, '真实超限1字节文件');
    check('真实20MiB加1字节明确回退下载且不签发地址', (await fs.stat(target)).size === maxBytes + 1 && !oversized.supported
      && oversized.size === maxBytes + 1 && !oversized.streamUrl && /20 MiB/.test(oversized.message));
    database(`UPDATE sys_file SET file_size=${maxBytes} WHERE file_id=${boundary.id};`);
    denied(await issueRaw(actor, boundaryRequest), '实际内容超出声明大小时有界读取安全失败', [503]);
    for (const [name, bytes] of [['HTML', Buffer.from('<!doctype html><script>alert(1)</script>')],
      ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
      ['XML', Buffer.from('<?xml version="1.0"?><private>secret</private>')]]) {
      await updateBytes(bytes);
      const forged = await issue(actor, boundaryRequest, `伪装PDF的${name}`);
      check(`实际${name}伪装为PDF时不进入预览且不签发地址`, !forged.supported && !forged.streamUrl && /实际内容/.test(forged.message));
    }
    await updateBytes(originalBytes, `h5p_${caseTag}_fallback.docx`, 'docx');
    const office = await issue(actor, boundaryRequest, '不支持的Office格式');
    check('Office明确提示原入口下载且不签发预览', !office.supported && !office.streamUrl && /下载/.test(office.message));
    const download = await context.api(actor, `/auth/system/file/${boundary.id}/content`);
    check('不支持预览时原授权下载保持有效', download.status === 200 && download.sha256 === boundary.digest && download.size === originalBytes.length);
    await updateBytes(originalBytes, boundary.name, 'png');
    const mismatched = await issue(actor, boundaryRequest, '文件扩展名和存储类型不一致');
    check('元信息不一致时拒绝进入预览', !mismatched.supported && !mismatched.streamUrl);
    await updateBytes(originalBytes);
    database(`UPDATE sys_file SET file_hash=NULL WHERE file_id=${boundary.id};`);
    const staleBytes = await issue(actor, boundaryRequest, '无历史哈希的旧文件');
    const modified = Buffer.from(originalBytes);
    modified[originalBytes.indexOf('First Hit')] = 'L'.charCodeAt(0);
    await fs.writeFile(target, modified);
    denied(await read(actor, staleBytes), '旧文件无存储哈希也按签发时内容摘要拒绝替换', [409]);
    await updateBytes(originalBytes);
    const staleMetadata = await issue(actor, boundaryRequest, '元信息变更');
    database(`UPDATE sys_file SET file_name=${previewSql(`h5p_${caseTag}_renamed.pdf`)} WHERE file_id=${boundary.id};`);
    denied(await read(actor, staleMetadata), '文件重命名后旧签名要求重新打开', [409]);
  } finally {
    await fs.writeFile(target, originalBytes);
    database(`UPDATE sys_file SET file_name=${previewSql(original.name)},file_type=${previewSql(original.extension)},file_size=${original.size},file_hash=${previewSql(original.hash)} WHERE file_id=${boundary.id};`);
    check('危险内容与超限字节隔离输入已恢复原文件和元信息', previewDigest(await fs.readFile(target)) === boundary.digest
      && database(`SELECT file_hash FROM sys_file WHERE file_id=${boundary.id};`) === original.hash);
  }
  const wait = expiry.expiresAt - Date.now() + 300;
  if (wait > 0) { console.log(`WAIT 不缩短签名有效期，等待真实60秒到期，剩余${Math.ceil(wait / 1000)}秒`); await previewPause(wait); }
  denied(await read(actor, expiry), '真实60秒到期后旧地址拒绝读取', [410]);
  check('真实到期同时清除Redis票据，不修改系统时钟', redis('EXISTS', expiryKey) === '0');
  console.log('H5_PREVIEW_CONTENT_BOUNDARIES: real_formats=5; max_bytes=20971520; over_limit_bytes=20971521; ranges=10; natural_expiry_seconds=60; unsafe_fixtures_restored=true; production_modified=false');
  evidence.content = true;
  evidence.expiry = true;
}
