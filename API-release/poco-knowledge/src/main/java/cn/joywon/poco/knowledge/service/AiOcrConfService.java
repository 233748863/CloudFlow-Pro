package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiOcrConfEntity;

public interface AiOcrConfService extends IService<AiOcrConfEntity> {

	/**
	 * 解析图像
	 * @param aiOcrConf AI OCR 会议
	 * @return {@link R }
	 */
	R parseImage(AiOcrConfEntity aiOcrConf);

}
