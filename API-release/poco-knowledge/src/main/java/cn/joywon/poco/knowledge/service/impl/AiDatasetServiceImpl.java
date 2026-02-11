package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.constant.SecurityConstants;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.service.AiDatasetService;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

/**
 * 知识库
 *
 * @author pig
 * @date 2024-03-14 13:39:21
 */
@Service
@RequiredArgsConstructor
public class AiDatasetServiceImpl extends ServiceImpl<AiDatasetMapper, AiDatasetEntity> implements AiDatasetService {

	/**
	 * “获取 AI 数据集”页面
	 * @param page 页
	 * @return {@link Page }<{@link AiDatasetEntity }>
	 */
	@Override
	public Page<AiDatasetEntity> getAiDatasetPage(Page<AiDatasetEntity> page) {
		return baseMapper.getAiDatasetPage(page);
	}

	/**
	 * 根据ID查询知识库
	 * @param datasetId 知识库ID
	 * @return R
	 */
	@Override
	public R getDatasetById(Long datasetId) {
		if (datasetId == null) {
			return R.failed("目标知识库ID不能为空");
		}

		AiDatasetEntity dataset = baseMapper.selectById(datasetId);
		if (Objects.isNull(dataset) || YesNoEnum.NO.getCode().equals(dataset.getPublicFlag())) {
			return R.failed(StrUtil.format("私有知识库，无法查看"));
		}

		return R.ok(dataset);
	}

	/**
	 * 创建知识库
	 * @param aiDataset 知识库
	 * @return boolean
	 */
	@SneakyThrows
	@Override
	@Transactional(rollbackFor = Exception.class)
	public R saveDataset(AiDatasetEntity aiDataset) {
		this.save(aiDataset);
		aiDataset.setCollectionName(SecurityConstants.PIGX_PREFIX + aiDataset.getId());
		baseMapper.updateById(aiDataset);
		return R.ok();
	}

}
