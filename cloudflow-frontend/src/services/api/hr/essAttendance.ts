import { ruleGet, rulePost, ruleUpload } from './rules';
import { readHrAuthorizedFile } from './fileDownload';
import { downloadBlob } from '@/utils/download';
export { attendanceLocationMessage, validateAttendancePhoto, locateForAttendance } from '@/utils/attendanceCheckin';

export interface AttendanceShift {
  shiftId: number;
  shiftName: string;
  attendanceDate: string;
  startTime: string;
  endTime: string;
}

export interface AttendanceCheckin {
  checkinId: number;
  checkTime: string;
  attendanceDate: string;
  logType: 'IN' | 'OUT';
  locationValidFlag: number | null;
  offshiftFlag: number | null;
  photoFileId?: number;
}

export interface TodayAttendance {
  today: string;
  serverTime: string;
  shift: AttendanceShift | null;
  inShift: AttendanceShift | null;
  outShift: AttendanceShift | null;
  checkins: AttendanceCheckin[];
}

export const getTodayAttendance = () => ruleGet<TodayAttendance>('/ess/attendance/today');
export const uploadAttendancePhoto = (file: File) => ruleUpload('/ess/attendance/photos', file);
export const submitAttendanceCheckin = (data: {
  logType: 'IN' | 'OUT'; latitude: number; longitude: number; photoFileId?: number;
}) => rulePost<number>('/ess/attendance/checkins', data);

export async function downloadAttendancePhoto(fileId: number, checkinId: number) {
  const blob = await readHrAuthorizedFile({ bizType: 'HR_ATTENDANCE_PHOTO', bizId: String(fileId), fileId });
  const extension = blob.type.split(';')[0] === 'image/png' ? 'png' : blob.type.split(';')[0] === 'image/webp' ? 'webp' : 'jpg';
  downloadBlob(blob, `考勤照片-${checkinId}.${extension}`);
}
