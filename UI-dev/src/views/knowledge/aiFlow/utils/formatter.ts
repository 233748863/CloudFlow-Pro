import { validatenull } from './validate';
import { FormatterClass } from '../types/utils';

/**
 * 格式化工具类
 */
export default class Formatter implements FormatterClass {
	/**
	 * 格式化JSON代码
	 * @param str - 需要格式化的JSON字符串
	 * @returns 格式化后的HTML字符串
	 */
	static prettyCode(str: string): string {
		try {
			// 为空则返回空
			if (validatenull(str)) {
				return '';
			}
			// 解析并格式化JSON字符串
			str = JSON.stringify(JSON.parse(str), null, 2);

			// 使用HTML实体进行替换（不改变&符号）
			str = str.replace(/</g, '&lt;').replace(/>/g, '&gt;');

			// 返回格式化的字符串，并添加样式类
			return str.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
				let cls = 'number';
				if (/^"/.test(match)) {
					if (/:$/.test(match)) {
						cls = 'key';
					} else {
						cls = 'string';
					}
				} else if (/true|false/.test(match)) {
					cls = 'boolean';
				} else if (/null/.test(match)) {
					cls = 'null';
				}
				return match;
			});
		} catch (e) {
			return str;
		}
	}
}
