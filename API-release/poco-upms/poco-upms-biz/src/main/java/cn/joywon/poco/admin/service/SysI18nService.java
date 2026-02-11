package cn.joywon.poco.admin.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.admin.api.entity.SysI18nEntity;
import cn.joywon.poco.common.core.util.R;

import java.util.Map;

public interface SysI18nService extends IService<SysI18nEntity> {

	Map listMap();

	/**
	 * 同步数据
	 * @return R
	 */
	R syncI18nCache();

}
