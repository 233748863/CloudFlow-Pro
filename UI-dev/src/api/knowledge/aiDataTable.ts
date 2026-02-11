import request from '/@/utils/request';

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiDataTable/page',
		method: 'get',
		params: query,
	});
}

export function addObj(obj?: Object) {
	return request({
		url: '/knowledge/aiDataTable',
		method: 'post',
		data: obj,
	});
}

export function getObj(id?: string) {
	return request({
		url: '/knowledge/aiDataTable/' + id,
		method: 'get',
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiDataTable',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj?: Object) {
	return request({
		url: '/knowledge/aiDataTable',
		method: 'put',
		data: obj,
	});
}

export function syncObj() {
	return request({
		url: '/knowledge/aiDataTable/sync',
		method: 'post',
	});
}

export function listTables(dsName: string) {
	return request({
		url: '/knowledge/aiDataTable/list',
		method: 'get',
		params: { dsName },
	});
}
