export function attendanceLocationMessage(flag: number | null | undefined) {
  return flag === 1 ? '位置核验通过' : flag === 0 ? '位置异常，待人事核查' : '位置核验结果待确认';
}

export function validateAttendancePhoto(file: Pick<File, 'size' | 'name'>): string | null {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) return '照片大小须大于0且不超过5MiB';
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return '请选择JPG、PNG或WebP照片';
  return null;
}

export function locateForAttendance(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) return Promise.reject(new Error('当前浏览器不支持定位，请使用支持定位的浏览器'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, error => {
    reject(new Error(error.code === 1
      ? '定位权限被拒绝，请在浏览器设置中允许本网站定位，再点击打卡'
      : error.code === 3 ? '定位超时，请到信号良好处重新打卡' : '暂时无法获取位置，请开启设备定位后重新打卡'));
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }));
}
