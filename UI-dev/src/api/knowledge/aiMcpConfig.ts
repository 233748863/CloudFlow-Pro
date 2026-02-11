import request from '/@/utils/request';

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiMcpConfig/page',
		method: 'get',
		params: query,
	});
}

export function list() {
	return request({
		url: '/knowledge/aiMcpConfig/list',
		method: 'get',
	});
}

export function addObj(obj?: Object) {
	return request({
		url: '/knowledge/aiMcpConfig',
		method: 'post',
		data: obj,
	});
}

export function getObj(id?: string) {
	return request({
		url: '/knowledge/aiMcpConfig/' + id,
		method: 'get',
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiMcpConfig',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj?: Object) {
	return request({
		url: '/knowledge/aiMcpConfig',
		method: 'put',
		data: obj,
	});
}
