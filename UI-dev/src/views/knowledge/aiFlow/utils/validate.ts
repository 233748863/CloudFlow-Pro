import { ValidationResult } from '../types/utils';

/**
 * 验证用户名是否有效
 * @param str - 用户名
 * @returns 是否有效
 */
export function isvalidUsername(str: string): boolean {
	const valid_map = ['admin', 'editor'];
	return valid_map.indexOf(str.trim()) >= 0;
}

/**
 * 验证URL是否合法
 * @param textval - URL字符串
 * @returns 是否合法
 */
export function validateURL(textval: string): boolean {
	const urlregex =
		/^(https?|ftp):\/\/([a-zA-Z0-9.-]+(:[a-zA-Z0-9.&%$-]+)*@)*((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.(com|edu|gov|int|mil|net|org|biz|arpa|info|name|pro|aero|coop|museum|[a-zA-Z]{2}))(:[0-9]+)*(\/($|[a-zA-Z0-9.,?'\\+&%$#=~_-]+))*$/;
	return urlregex.test(textval);
}

/**
 * 验证邮箱
 * @param s - 邮箱字符串
 * @returns 是否有效
 */
export function isEmail(s: string): boolean {
	return /^([a-zA-Z0-9_-])+@([a-zA-Z0-9_-])+((.[a-zA-Z0-9_-]{2,3}){1,2})$/.test(s);
}

/**
 * 验证手机号码
 * @param s - 手机号码
 * @returns 是否有效
 */
export function isMobile(s: string): boolean {
	return /^1[0-9]{10}$/.test(s);
}

/**
 * 验证电话号码
 * @param s - 电话号码
 * @returns 是否有效
 */
export function isPhone(s: string): boolean {
	return /^([0-9]{3,4}-)?[0-9]{7,8}$/.test(s);
}

/**
 * 验证URL地址
 * @param s - URL地址
 * @returns 是否有效
 */
export function isURL(s: string): boolean {
	return /^http[s]?:\/\/.*/.test(s);
}

/**
 * 验证小写字母
 * @param str - 字符串
 * @returns 是否全为小写字母
 */
export function validateLowerCase(str: string): boolean {
	const reg = /^[a-z]+$/;
	return reg.test(str);
}

/**
 * 验证大写字母
 * @param str - 字符串
 * @returns 是否全为大写字母
 */
export function validateUpperCase(str: string): boolean {
	const reg = /^[A-Z]+$/;
	return reg.test(str);
}

/**
 * 验证大小写字母
 * @param str - 字符串
 * @returns 是否全为字母
 */
export function validatAlphabets(str: string): boolean {
	const reg = /^[A-Za-z]+$/;
	return reg.test(str);
}

/**
 * 验证是否为PC设备
 * @returns 是否为PC设备
 */
export const vaildatePc = function (): boolean {
	const userAgentInfo = navigator.userAgent;
	const Agents = ['Android', 'iPhone', 'SymbianOS', 'Windows Phone', 'iPad', 'iPod'];
	let flag = true;
	for (let v = 0; v < Agents.length; v++) {
		if (userAgentInfo.indexOf(Agents[v]) > 0) {
			flag = false;
			break;
		}
	}
	return flag;
};

/**
 * 验证邮箱
 * @param email - 邮箱地址
 * @returns 是否有效
 */
export function validateEmail(email: string): boolean {
	const re =
		/^(([^<>()\\[\]\\.,;:\s@"]+(\.[^<>()\\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
	return re.test(email);
}

/**
 * 验证身份证号码
 * @param code - 身份证号码
 * @returns 验证结果数组 [是否有效, 错误信息]
 */
export function cardid(code: string): [boolean, string] {
	let result = true;
	let msg = '';
	const city: { [key: string]: string } = {
		11: '北京',
		12: '天津',
		13: '河北',
		14: '山西',
		15: '内蒙古',
		21: '辽宁',
		22: '吉林',
		23: '黑龙江',
		31: '上海',
		32: '江苏',
		33: '浙江',
		34: '安徽',
		35: '福建',
		36: '江西',
		37: '山东',
		41: '河南',
		42: '湖北',
		43: '湖南',
		44: '广东',
		45: '广西',
		46: '海南',
		50: '重庆',
		51: '四川',
		52: '贵州',
		53: '云南',
		54: '西藏',
		61: '陕西',
		62: '甘肃',
		63: '青海',
		64: '宁夏',
		65: '新疆',
		71: '台湾',
		81: '香港',
		82: '澳门',
		91: '国外',
	};

	if (!validatenull(code)) {
		if (code.length === 18) {
			if (!code || !/(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(code)) {
				msg = '证件号码格式错误';
			} else if (!city[code.substr(0, 2)]) {
				msg = '地址编码错误';
			} else {
				// 18位身份证需要验证最后一位校验位
				const codeArray = code.split('');
				// ∑(ai×Wi)(mod 11)
				// 加权因子
				const factor = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
				// 校验位
				const parity = [1, 0, 'X', 9, 8, 7, 6, 5, 4, 3, 2, 'x'];
				let sum = 0;
				let ai = 0;
				let wi = 0;
				for (let i = 0; i < 17; i++) {
					ai = parseInt(codeArray[i]);
					wi = factor[i];
					sum += ai * wi;
				}
				if (parity[sum % 11] !== codeArray[17]) {
					msg = '证件号码校验位错误';
				} else {
					result = false;
				}
			}
		} else {
			msg = '证件号码长度不为18位';
		}
	} else {
		msg = '证件号码不能为空';
	}
	return [result, msg];
}

/**
 * 验证手机号码
 * @param phone - 手机号码
 * @returns 验证结果数组 [是否有效, 错误信息]
 */
export function isvalidatemobile(phone: string): [boolean, string] {
	let result = true;
	let msg = '';
	const isPhone = /^0\d{2,3}-?\d{7,8}$/;

	if (!validatenull(phone)) {
		if (phone.length === 11) {
			if (isPhone.test(phone)) {
				msg = '手机号码格式不正确';
			} else {
				result = false;
			}
		} else {
			msg = '手机号码长度不为11位';
		}
	} else {
		msg = '手机号码不能为空';
	}
	return [result, msg];
}

/**
 * 验证姓名是否正确
 * @param name - 姓名
 * @returns 是否有效
 */
export function validatename(name: string): boolean {
	const regName = /^[\u4e00-\u9fa5]{2,4}$/;
	return regName.test(name);
}

/**
 * 验证是否为整数
 * @param num - 数字
 * @param type - 类型 1:非数字 2:整数
 * @returns 是否有效
 */
export function validatenum(num: string, type: number): boolean {
	let regName = /[^\d.]/g;
	if (type === 1) {
		if (!regName.test(num)) return false;
	} else if (type === 2) {
		regName = /[^\d]/g;
		if (!regName.test(num)) return false;
	}
	return true;
}

/**
 * 验证是否为小数
 * @param num - 数字
 * @param type - 类型
 * @returns 是否有效
 */
export function validatenumord(num: string, type: number): boolean {
	let regName = /[^\d.]/g;
	if (type === 1) {
		if (!regName.test(num)) return false;
	} else if (type === 2) {
		regName = /[^\d.]/g;
		if (!regName.test(num)) return false;
	}
	return true;
}

/**
 * 判断是否为空
 * @param val - 待验证的值
 * @returns 是否为空
 */
export function validatenull(val: any): boolean {
	if (typeof val === 'boolean') {
		return false;
	}
	if (typeof val === 'number') {
		return false;
	}
	if (val instanceof Array) {
		if (val.length === 0) return true;
	} else if (val instanceof Object) {
		if (JSON.stringify(val) === '{}') return true;
	} else {
		if (val === 'null' || val == null || val === 'undefined' || val === undefined || val === '') return true;
		return false;
	}
	return false;
}

/**
 * 判断输入是否为有效的 JSON 或者 JSON 字符串
 * @param val - 待判断的值
 * @returns 如果是对象或可解析的 JSON 字符串，返回 true；否则返回 false
 */
export function validatejson(val: any): boolean {
	// 直接判断是否为对象（排除 null 和数组）
	if (val !== null && typeof val === 'object') {
		return true;
	}

	// 尝试解析字符串为 JSON
	if (typeof val === 'string') {
		try {
			const obj = JSON.parse(val);
			// 解析后还需判断是否为对象或数组
			return obj !== null && typeof obj === 'object';
		} catch (e) {
			return false;
		}
	}

	// 非对象、非数组、非字符串，或者字符串不是 JSON
	return false;
}
