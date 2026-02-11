package cn.joywon.poco.admin.api.vo;

import cn.joywon.poco.admin.api.entity.SysMessageEntity;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 消息发送实体
 *
 * @author poco
 * @date 2023/10/25
 */
@Data
public class SysMessageVO extends SysMessageEntity {

	/**
	 * 是否已读
	 */
	private String readFlag;

	/**
	 * 发送用户列表
	 */
	private List<OrgTreeVO> userList = new ArrayList<>();

}
