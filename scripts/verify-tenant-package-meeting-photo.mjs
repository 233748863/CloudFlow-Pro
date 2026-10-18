import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const meetingPhotoPermissions = ['oa:meeting-room:add', 'oa:meeting-room:list', 'oa:meeting-room:remove', 'oa:meeting:room-manage'];

export async function verifyMeetingPhotoCapacity({ tenantAdmin, api, successful, database, check, caseTag,
  state, targetId, applyLimit, usage, physicalSnapshot, evidence }) {
  const marker = `H5_PHOTO_${caseTag}`;
  const prefix = `${caseTag}-meeting-photo-`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const files = () => database(`SELECT JSON_OBJECT('id',file_id,'name',file_name,'path',file_path,'size',file_size,
    'business',biz_type,'businessId',biz_id,'type',file_type,'url',url,'deleted',deleted) FROM sys_file
    WHERE tenant_id=${targetId} AND file_name LIKE ${sql(prefix + '%')} ORDER BY file_id;`)
    .split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const beforeUsage = usage();
  const beforeFiles = await physicalSnapshot();
  let roomId;
  let failure;
  const bytes = phase => Buffer.concat([
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64'),
    Buffer.from(`${marker}:${phase}`),
  ]);
  const upload = phase => api(tenantAdmin, `/oa/meeting-room/${roomId}/photo`, { method: 'POST',
    file: { name: `${prefix}${phase}.png`, type: 'image/png', content: bytes(phase).toString('base64') } });
  const savePhoto = async photoFileId => {
    const room = successful(await api(tenantAdmin, `/oa/meeting-room/${roomId}`), '读取自有会议室版本');
    assert.equal(room.name, marker);
    assert.ok(room.photoFileId == null || files().some(file => Number(room.photoFileId) === file.id));
    return successful(await api(tenantAdmin, `/oa/meeting-room/${roomId}/booking-rule`, { method: 'PUT', body: {
      version: room.version, photoFileId, holidayBookableFlag: 1, minBookingMinutes: 1, needApprovalFlag: 0, bufferMinutes: 0,
    } }), photoFileId == null ? '真实解除自有测试照片绑定' : '真实绑定会议室照片');
  };
  const verifyDownload = async phase => {
    const downloaded = await api(tenantAdmin, `/oa/meeting-room/${roomId}/photo`);
    check(`${phase}绑定照片经OA和AUTH完整下载且禁止缓存`, downloaded.status === 200
      && downloaded.size === bytes('allowed').length
      && downloaded.sha256 === createHash('sha256').update(bytes('allowed')).digest('hex')
      && /no-store/.test(downloaded.cacheControl || '') && downloaded.nosniff === 'nosniff');
  };
  const ownedPath = async file => {
    assert.ok(Number.isSafeInteger(file.id) && file.id > 0);
    assert.equal(file.business, 'OA_MEETING_ROOM');
    assert.equal(file.businessId, String(roomId));
    assert.equal(file.type, 'png');
    assert.equal(file.deleted, 0);
    assert.ok(!file.url);
    const root = await fs.realpath(path.join(state.run, 'profile'));
    const target = await fs.realpath(path.resolve(root, file.path.replace(/^\//, '')));
    assert.ok(target.startsWith(root + path.sep));
    return target;
  };
  assert.equal(files().length, 0);
  assert.equal(database(`SELECT COUNT(*) FROM oa_meeting_room WHERE tenant_id=${targetId} AND name=${sql(marker)};`), '0');
  try {
    await applyLimit(8);
    successful(await api(tenantAdmin, '/oa/meeting-room', { method: 'POST', body: { name: marker, capacity: 2, location: marker, status: '1' } }), '真实创建本轮照片验证会议室');
    roomId = Number(database(`SELECT room_id FROM oa_meeting_room WHERE tenant_id=${targetId} AND name=${sql(marker)} AND deleted=0;`));
    assert.ok(Number.isSafeInteger(roomId) && roomId > 0);
    const uploaded = successful(await upload('allowed'), '会议室照片经OA到AUTH真实上传成功');
    const original = files().find(file => file.id === Number(uploaded.fileId));
    assert.ok(original);
    const storedPath = await ownedPath(original);
    check('会议照片原始字节完整且仅计入当前租户容量', (await fs.readFile(storedPath)).equals(bytes('allowed'))
      && usage() === beforeUsage + bytes('allowed').length && files().length === 1);
    await savePhoto(original.id);
    await verifyDownload('降额前');
    await applyLimit(1);
    await verifyDownload('降额后');
    const retained = JSON.stringify(files());
    const retainedFiles = await physicalSnapshot();
    // Multipart bytes are excluded from the duplicate-submission key for this room.
    await new Promise(resolve => setTimeout(resolve, 5100));
    const rejected = await upload('denied');
    console.log(`H5_MEETING_PHOTO_CAPACITY: http=${rejected.status}; code=${rejected.body?.code}; capacity_message=${/存储空间不足/.test(rejected.body?.msg || '')}; repeat_message=${/重复提交|频繁/.test(rejected.body?.msg || '')}; real_oa_auth=true`);
    check('会议照片降额后返回明确容量不足409', rejected.status === 409 && rejected.body?.code === 409
      && /存储空间不足/.test(rejected.body?.msg || ''));
    check('会议照片拒绝新增后原记录和字节保留', retained === JSON.stringify(files())
      && JSON.stringify(retainedFiles) === JSON.stringify(await physicalSnapshot())
      && (await fs.readFile(storedPath)).equals(bytes('allowed')) && usage() === beforeUsage + original.size);
    evidence.storageMeetingPhoto = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const failures = [];
    if (roomId) {
      try { await savePhoto(null); } catch (error) { failures.push(error); }
      for (const file of files()) {
        try {
          const target = await ownedPath(file);
          assert.equal(database(`SELECT COUNT(*) FROM oa_meeting_room WHERE tenant_id=${targetId} AND photo_file_id=${file.id};`), '0');
          database(`DELETE FROM sys_file WHERE tenant_id=${targetId} AND file_id=${file.id} AND file_name=${sql(file.name)} AND biz_type='OA_MEETING_ROOM' AND biz_id='${roomId}';`);
          await fs.unlink(target);
        } catch (error) { failures.push(error); }
      }
      try {
        const room = successful(await api(tenantAdmin, `/oa/meeting-room/${roomId}`), '读取本轮会议室清理版本');
        assert.equal(room.name, marker);
        successful(await api(tenantAdmin, `/oa/meeting-room/${roomId}?version=${room.version}`, { method: 'DELETE' }), '真实删除没有预订的本轮会议室');
      } catch (error) { failures.push(error); }
    }
    try { await applyLimit(1); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError([...(failure ? [failure] : []), ...failures], '会议照片容量验证清理不完整');
    check('会议照片和测试会议室清理且原容量恢复', files().length === 0 && usage() === beforeUsage
      && JSON.stringify(beforeFiles) === JSON.stringify(await physicalSnapshot())
      && database(`SELECT COUNT(*) FROM oa_meeting_room WHERE tenant_id=${targetId} AND name=${sql(marker)} AND deleted=0;`) === '0');
    evidence.storageMeetingPhotoCleanup = true;
  }
}
