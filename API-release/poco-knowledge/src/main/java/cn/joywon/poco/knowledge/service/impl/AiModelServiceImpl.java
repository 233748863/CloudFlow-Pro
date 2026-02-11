package cn.joywon.poco.knowledge.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.service.AiModelService;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;

/**
 * 模型配置
 *
 * @author poco
 * @date 2024-09-27 23:37:54
 */
@Service
@RequiredArgsConstructor
public class AiModelServiceImpl extends ServiceImpl<AiModelMapper, AiModelEntity> implements AiModelService {

	private final ModelProvider modelProvider;

	/**
	 * 保存模型
	 * @param aiModel AI 模型
	 * @return {@link R }
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public R saveModel(AiModelEntity aiModel) {
		setDefaultModel(aiModel);
		baseMapper.insert(aiModel);
		return null;
	}

	/**
	 * 更新模型
	 * @param aiModel AI 模型
	 * @return boolean
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public R updateModel(AiModelEntity aiModel) {
		setDefaultModel(aiModel);
		baseMapper.updateById(aiModel);
		modelProvider.delete(aiModel.getName());
		return R.ok();
	}

	/**
	 * 删除模型
	 * @param idList 列表
	 * @return boolean
	 */
	@Override
	public R removeModel(ArrayList<Long> idList) {
		idList.stream().forEach(id -> {
			AiModelEntity aiModelEntity = baseMapper.selectById(id);
			modelProvider.delete(aiModelEntity.getName());
		});
		baseMapper.deleteBatchIds(idList);
		return R.ok();
	}

	/**
	 * 设置默认模型
	 * @param aiModel AI 模型
	 */
	private void setDefaultModel(AiModelEntity aiModel) {
		if (aiModel.getDefaultModel().equals(YesNoEnum.YES.getCode())) {
			AiModelEntity aiModelEntity = new AiModelEntity();
			aiModelEntity.setDefaultModel(YesNoEnum.NO.getCode());
			baseMapper.update(aiModelEntity,
					Wrappers.<AiModelEntity>lambdaUpdate()
						.eq(AiModelEntity::getModelType, aiModel.getModelType())
						.eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode()));
		}
	}

}
