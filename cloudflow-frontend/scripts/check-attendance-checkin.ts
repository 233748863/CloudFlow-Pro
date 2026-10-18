import assert from 'node:assert/strict';
import { attendanceLocationMessage, locateForAttendance, validateAttendancePhoto } from '../src/utils/attendanceCheckin';

let checks = 0;
function check(label: string, run: () => void) { run(); checks++; console.log(`PASS ${label}`); }
check('支持四种照片扩展名及大小写', () => {
  for (const name of ['a.jpg', 'a.JPEG', 'a.png', 'a.webp']) assert.equal(validateAttendancePhoto({ name, size: 1 }), null);
});
check('大小上限为5MiB且不可为空', () => {
  assert.equal(validateAttendancePhoto({ name: 'a.jpg', size: 5 * 1024 * 1024 }), null);
  for (const size of [0, -1, NaN, Infinity, 5 * 1024 * 1024 + 1]) assert.ok(validateAttendancePhoto({ name: 'a.jpg', size }));
});
check('扩展名必须带点并位于文件名末尾', () => {
  for (const name of ['ajpg', 'a.jpg.exe', 'a.gif', 'a.svg']) assert.ok(validateAttendancePhoto({ name, size: 20 }));
});
check('分别展示围栏通过、异常和未确认', () => {
  assert.equal(attendanceLocationMessage(1), '位置核验通过');
  assert.equal(attendanceLocationMessage(0), '位置异常，待人事核查');
  assert.equal(attendanceLocationMessage(null), '位置核验结果待确认');
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
await assert.rejects(locateForAttendance(), /不支持定位/); checks++;
let options: PositionOptions | undefined;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: {
  getCurrentPosition(success: PositionCallback, _failure: PositionErrorCallback, input: PositionOptions) {
    options = input; success({ coords: { latitude: 31, longitude: 121 } } as GeolocationPosition);
  },
} } });
const position = await locateForAttendance();
check('主动定位返回经纬度且使用当前精确位置', () => {
  assert.equal(position.coords.latitude, 31); assert.equal(position.coords.longitude, 121);
  assert.deepEqual(options, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});
for (const [code, message] of [[1, /权限被拒绝/], [2, /开启设备定位/], [3, /定位超时/]] as const) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: {
    getCurrentPosition(_success: PositionCallback, failure: PositionErrorCallback) { failure({ code } as GeolocationPositionError); },
  } } });
  await assert.rejects(locateForAttendance(), message); checks++;
}
console.log(`Completed ${checks} basic checks; no browser or build artifacts created.`);
