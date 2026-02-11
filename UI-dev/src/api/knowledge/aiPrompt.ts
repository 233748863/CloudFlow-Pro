import request from '/@/utils/request';

export function list(query?: Object) {
	return request({
		url: '/knowledge/aiPrompt/list',
		method: 'get',
		params: query,
	});
}

export function functions(query?: Object) {
	return request({
		url: '/knowledge/aiFunc/functions',
		method: 'get',
		params: query,
	});
}

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiPrompt/page',
		method: 'get',
		params: query,
	});
}

export function addObj(obj?: Object) {
	return request({
		url: '/knowledge/aiPrompt',
		method: 'post',
		data: obj,
	});
}

export function getObj(id?: string) {
	return request({
		url: '/knowledge/aiPrompt/' + id,
		method: 'get',
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiPrompt',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj?: Object) {
	return request({
		url: '/knowledge/aiPrompt',
		method: 'put',
		data: obj,
	});
}

export function optimizeAiPrompt(obj?: Object) {
	return request({
		url: '/knowledge/aiPrompt/optimize',
		method: 'post',
		data: obj,
	});
}
