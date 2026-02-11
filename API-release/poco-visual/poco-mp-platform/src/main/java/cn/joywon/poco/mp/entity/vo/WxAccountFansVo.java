package cn.joywon.poco.mp.entity.vo;

import cn.joywon.poco.mp.entity.WxAccountFans;
import cn.joywon.poco.mp.entity.WxAccountTag;
import lombok.Data;

import java.util.List;

/**
 * 粉丝Vo 对象
 *
 * @author poco
 * @date 2022/1/5
 */
@Data
public class WxAccountFansVo extends WxAccountFans {

	/**
	 * 标签名称列表
	 */
	private List<WxAccountTag> tagList;

}
