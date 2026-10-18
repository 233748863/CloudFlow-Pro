import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMeetingEquipment } from '../cloudflow-frontend/src/utils/meetingEquipment.ts';

test('会议室设备空值和非列表数据不会使既有管理页面崩溃', () => {
  for (const value of [undefined, null, '', '  ', 'null', '{}', '42', 'true']) assert.deepEqual(readMeetingEquipment(value), []);
});

test('会议室设备保留原数组、原文字及合法字符串，不渲染对象', () => {
  assert.deepEqual(readMeetingEquipment('["投影仪","白板"]'), ['投影仪', '白板']);
  assert.deepEqual(readMeetingEquipment('原设备文字保留'), ['原设备文字保留']);
  assert.deepEqual(readMeetingEquipment('"视频会议"'), ['视频会议']);
  assert.deepEqual(readMeetingEquipment('[null,{},42,"", "  ","电话会议"]'), ['电话会议']);
});
