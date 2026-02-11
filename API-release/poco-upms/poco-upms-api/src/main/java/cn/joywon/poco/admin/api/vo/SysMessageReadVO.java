package cn.joywon.poco.admin.api.vo;

import cn.joywon.poco.admin.api.entity.SysMessageRelationEntity;
import lombok.Data;

/**
 * 消息阅读vo
 *
 * @author poco
 * @date 2023/10/26
 */
@Data
public class SysMessageReadVO extends SysMessageRelationEntity {

	/**
	 * 文章标题
	 */
	private String title;

	/**
	 * 用户名
	 */
	private String username;

	/**
	 * 姓名
	 */
	private String name;

}
