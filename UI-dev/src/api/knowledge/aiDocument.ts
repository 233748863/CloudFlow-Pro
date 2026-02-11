import request from '/@/utils/request';

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiDocument/page',
		method: 'get',
		params: query,
	});
}

export function addObj(obj?: Object) {
	return request({
		url: '/knowledge/aiDocument',
		method: 'post',
		data: obj,
	});
}

export function getObj(id?: string) {
	return request({
		url: '/knowledge/aiDocument/' + id,
		method: 'get',
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiDocument',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj?: Object) {
	return request({
		url: '/knowledge/aiDocument',
		method: 'put',
		data: obj,
	});
}

export function retrySlice(obj?: Object) {
	return request({
		url: '/knowledge/aiDocument/retry/slice',
		method: 'post',
		data: obj,
	});
}

export function retryIssue(obj?: Object) {
	return request({
		url: '/knowledge/aiDocument/retry/issue',
		method: 'post',
		data: obj,
	});
}

export function embedDocument(obj?: Object) {
	return request({
		url: '/knowledge/aiDocument/embed',
		method: 'post',
		data: obj,
	});
}
