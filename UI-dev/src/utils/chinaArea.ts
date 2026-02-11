import request from '/@/utils/request';

enum Api {
	LocationByCode = '/admin/sysArea/location/byCode',
	LocationByName = '/admin/sysArea/code/byName',
}
// 根据区域编码获取区域名称
export async function codeToText(code: string) {
	const codes = code.split(',');
	const areaList: string[] = [];
	for (const adCode of codes) {
		let response = await request({
			url: Api.LocationByCode,
			method: 'get',
			params: {
				adCode: Number(adCode),
			},
		});
		areaList.push(response.data);
	}
	return splitAreaName(areaList.join(''));
}
// 根据区域名称获取区域编码
export async function textToCode(name: string) {
	// 处理名称中包含空格的情况
	name = name.replace(/\s+/g, '');
	const areaName = splitAreaName(name);
	// 构建查询参数
	const areaList : string[] = [];
	for (const key in areaName) {
		let response= await request({
			url: Api.LocationByName,
			method: 'get',
			params: {
				name: areaName[key],
			},
		});
		areaList.push(response.data);
	}
	return areaList.join(',');
}
// 按行政级别分割地区名称
export function splitAreaName(fullName: string) {
	// 去除空格
	const name = fullName.replace(/\s+/g, '');

	// 定义行政级别正则表达式，按从高级到低级的顺序
	const levelPatterns = [
		{ key: 'province', pattern: /^(.+?)(省|特别行政区|自治区|直辖市|市)/ }, // 添加^锚点确保从字符串开头匹配
		{ key: 'city', pattern: /(.+?)(市|地区|自治州|盟)/ },
		{ key: 'district', pattern: /(.+?)(区|县|县级市|旗|市)/ },
		{ key: 'town', pattern: /(.+?)(镇|街道|乡|民族乡|苏木|民族苏木)/ },
	];

	// 存储结果
	const result: {[key: string]: string} = {};
	let remainingName = name;

	// 按顺序匹配各级行政区
	for (const level of levelPatterns) {
		const match = remainingName.match(level.pattern);
		if (match) {
			// 保存当前级别名称（包括后缀）
			result[level.key] = match[0];
			// 更新剩余名称 - 直接使用match后的剩余部分
			remainingName = remainingName.slice(match.index! + match[0].length);
		}
	}

	// 如果还有剩余部分，作为最详细的地址
	if (remainingName.trim()) {
		result.detail = remainingName;
	}

	return result;
}
