import request from './request';
import type { PageResult } from './job';

export type HolidayCalendarStatus = 'ENABLED' | 'DISABLED';
export type HolidayDateType = 'WORKDAY' | 'HOLIDAY' | 'REST';

export interface HolidayCalendar {
  calendarId?: number;
  tenantId?: number;
  calendarCode: string;
  calendarName: string;
  region?: string;
  defaultFlag: number;
  weeklyRestDays: string;
  workStartTime: string;
  workEndTime: string;
  lunchStartTime?: string;
  lunchEndTime?: string;
  status: HolidayCalendarStatus;
  remark?: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
}

export type HolidayCalendarPayload = Omit<
  HolidayCalendar,
  'tenantId' | 'createBy' | 'createTime' | 'updateBy' | 'updateTime'
>;

export interface HolidayDateItem {
  dateId?: number;
  tenantId?: number;
  calendarId?: number;
  holidayDate: string;
  dateType: HolidayDateType;
  holidayName?: string;
  triplePayFlag: number;
  yearNo?: number;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface DayType {
  date: string;
  dateType: HolidayDateType;
  holidayName?: string;
  triplePayFlag: number;
}

const basePath = '/auth/system/holiday';

export const getHolidayCalendars = (params: { pageNum: number; pageSize: number }) =>
  request.get<PageResult<HolidayCalendar>>(`${basePath}/calendar/list`, { params });

export const getAllHolidayCalendars = async () => {
  const pageSize = 200;
  const firstPage = await getHolidayCalendars({ pageNum: 1, pageSize });
  const pageCount = Math.ceil(Number(firstPage.total || 0) / pageSize);
  if (pageCount <= 1) return firstPage.rows || [];
  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      getHolidayCalendars({ pageNum: index + 2, pageSize }),
    ),
  );
  return [
    ...(firstPage.rows || []),
    ...remainingPages.flatMap((page) => page.rows || []),
  ];
};

export const getHolidayCalendar = (calendarId: number) =>
  request.get<HolidayCalendar>(`${basePath}/calendar/${calendarId}`);

export const addHolidayCalendar = (data: HolidayCalendarPayload) =>
  request.post(`${basePath}/calendar`, data);

export const updateHolidayCalendar = (data: HolidayCalendarPayload) =>
  request.put(`${basePath}/calendar`, data);

export const deleteHolidayCalendars = (calendarIds: number[]) =>
  request.delete(`${basePath}/calendar/${calendarIds.join(',')}`);

export const getHolidayDates = (calendarId: number, yearNo: number) =>
  request.get<HolidayDateItem[]>(`${basePath}/date/list`, { params: { calendarId, yearNo } });

export const saveHolidayDates = (
  calendarId: number,
  yearNo: number,
  dates: HolidayDateItem[],
) =>
  request.post(`${basePath}/date/batch`, {
    calendarId,
    yearNo,
    dates: dates.map(({ holidayDate, dateType, holidayName, triplePayFlag, remark }) => ({
      holidayDate,
      dateType,
      holidayName,
      triplePayFlag,
      remark,
    })),
  });

export const getHolidayMonthTypes = (calendarId: number, year: number, month: number) =>
  request.get<DayType[]>(`${basePath}/query/month`, {
    params: { calendarId, year, month },
  });

export const deleteHolidayDates = (dateIds: number[]) =>
  request.delete(`${basePath}/date/${dateIds.join(',')}`);

export const isHolidayWorkday = (calendarId: number, date: string) =>
  request.get<boolean>(`${basePath}/query/is-workday`, { params: { calendarId, date } });

export const countHolidayWorkdays = (
  calendarId: number,
  startDate: string,
  endDate: string,
) =>
  request.get<number>(`${basePath}/query/count-workdays`, {
    params: { calendarId, startDate, endDate },
  });

export const getNextHolidayWorkday = (calendarId: number, date: string, n: number) =>
  request.get<string>(`${basePath}/query/next-workday`, {
    params: { calendarId, date, n },
  });

export const getHolidayDateType = (calendarId: number, date: string) =>
  request.get<DayType>(`${basePath}/query/date-type`, { params: { calendarId, date } });

export const resolveHolidayCalendar = (employeeId: number, date: string) =>
  request.get<number>(`${basePath}/query/resolve-calendar`, {
    params: { employeeId, date },
  });
