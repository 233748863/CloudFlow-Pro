package cn.joywon.poco.common.data.resolver;

import cn.joywon.poco.common.core.util.KeyStrResolver;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;

/**
 * @author poco
 * @date 2020/9/29
 * <p>
 * 租户字符串处理（方便其他模块获取）
 */
public class TenantKeyStrResolver implements KeyStrResolver {

	/**
	 * 传入字符串增加 租户编号:in
	 * @param in 输入字符串
	 * @param split 分割符
	 * @return
	 */
	@Override
	public String extract(String in, String split) {
		return TenantContextHolder.getTenantId() + split + in;
	}

	/**
	 * 返回当前租户ID
	 * @return
	 */
	@Override
	public String key() {
		return String.valueOf(TenantContextHolder.getTenantId());
	}

}
