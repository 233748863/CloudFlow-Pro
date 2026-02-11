import request from '/@/utils/request';

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiModel/page',
		method: 'get',
		params: query,
	});
}

export function details(query?: Object) {
	return request({
		url: '/knowledge/aiModel/details',
		method: 'get',
		params: query,
	});
}

export function list(query?: Object) {
	return request({
		url: '/knowledge/aiModel/list',
		method: 'get',
		params: query,
	});
}

export function addObj(obj?: Object) {
	return request({
		url: '/knowledge/aiModel',
		method: 'post',
		data: obj,
	});
}

export function getObj(id?: string) {
	return request({
		url: '/knowledge/aiModel/' + id,
		method: 'get',
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiModel',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj?: Object) {
	return request({
		url: '/knowledge/aiModel',
		method: 'put',
		data: obj,
	});
}

export function validateExist(rule: any, value: any, callback: any, isEdit: boolean) {
	if (isEdit) {
		return callback();
	}
	details({ [rule.field]: value }).then((response) => {
		const result = response.data;
		if (result !== null && result.length > 0) {
			callback(new Error('数据已经存在'));
		} else {
			callback();
		}
	});
}
