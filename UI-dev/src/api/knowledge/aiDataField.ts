import request from '/@/utils/request';

export function fetchByTableId(id: string, tableName: string) {
	return request({
		url: `/knowledge/aiDataField/table/${id}/${tableName}`,
		method: 'get',
	});
}

export function syncByTableId(id: string, tableName: string) {
	return request({
		url: `/knowledge/aiDataField/sync/${id}/${tableName}`,
		method: 'post',
	});
}

export function batchUpdateObj(data: any[]) {
	return request({
		url: '/knowledge/aiDataField/batch',
		method: 'put',
		data,
	});
}

export function assessByTableId(id: string, tableName: string) {
	return request({
		url: `/knowledge/aiDataField/assess/${id}/${tableName}`,
		method: 'post',
	});
}
