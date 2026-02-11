import { FlowClass } from '../types/utils';

export default class Flow implements FlowClass {
  /**
   * 获取统一的URL参数
   * @param type - 流程类型
   * @param id - 流程ID
   * @returns 格式化的URL字符串
   */
  static runUrl(type: string, id: string): string {
    return `/flow/${type}/${id}`;
  }

  /**
   * 获取icon地址
   * @param icon - 图标路径
   * @returns 图标路径或默认图标
   */
  static getIcon(icon?: string): string {
    return icon ? icon : '/img/chat/icon.png';
  }
} 