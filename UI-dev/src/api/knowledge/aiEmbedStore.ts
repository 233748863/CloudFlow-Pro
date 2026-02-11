import request from '/@/utils/request';

export function fetchList(query?: Object) {
	return request({
		url: '/knowledge/aiEmbedStore/page',
		method: 'get',
		params: query,
	});
}

export function list() {
	return request({
		url: '/knowledge/aiEmbedStore/list',
		method: 'get',
	});
}

export function addObj(obj?: Object) {
	return request({
		url: '/knowledge/aiEmbedStore',
		method: 'post',
		data: obj,
	});
}

export function getObj(obj: object) {
	return request({
		url: '/knowledge/aiEmbedStore/details',
		method: 'get',
		params: obj,
	});
}

export function delObjs(ids?: Object) {
	return request({
		url: '/knowledge/aiEmbedStore',
		method: 'delete',
		data: ids,
	});
}

export function putObj(obj?: Object) {
	return request({
		url: '/knowledge/aiEmbedStore',
		method: 'put',
		data: obj,
	});
}

export function validateExist(rule: any, value: any, callback: any, isEdit: boolean) {
	if (isEdit) {
		return callback();
	}
	getObj({ [rule.field]: value }).then((response) => {
		const result = response.data;
		if (result !== null) {
			callback(new Error('数据已经存在'));
		} else {
			callback();
		}
	});
}
