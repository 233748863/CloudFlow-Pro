package cn.joywon.poco.merchant.PlatformModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryCreateDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.Industry;
import cn.joywon.poco.merchant.PlatformModule.mapper.IndustryMapper;
import cn.joywon.poco.merchant.PlatformModule.service.IIndustryAdminService;
import cn.joywon.poco.merchant.PlatformModule.vo.IndustryVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class IndustryAdminServiceImpl extends ServiceImpl<IndustryMapper, Industry> implements IIndustryAdminService {

    /**
     * 添加行业分类
     *
     * @param dto 行业分类新增参数
     */
    @Override
    public R<?> addIndustry(IndustryCreateDTO dto) {
        Industry entity = lambdaQuery()
                .eq(Industry::getName, dto.getName()).last("LIMIT 1").one();
        if (entity != null) {
            return R.failed("添加行业分类失败, 该行业分类已存在");
        }

        entity = new Industry();
        BeanUtil.copyProperties(dto, entity);
        boolean result = save(entity);
        return result ? R.ok() : R.failed("添加行业分类失败");
    }


    /**
     * 删除行业分类
     *
     * @param id 行业分类ID
     */
    @Override
    public R<?> deleteIndustry(Long id) {
        Industry entity = lambdaQuery().eq(Industry::getId, id).one();
        if (entity == null) {
            return R.failed("删除行业分类失败, 无效的ID");
        }
        entity.setDeletedTime(LocalDateTime.now());
        boolean result = removeById(entity);
        return result ? R.ok() : R.failed("删除行业分类失败");
    }


    /**
     * 修改行业分类
     *
     * @param dto 行业分类修改参数
     */
    @Override
    public R<?> updateIndustry(IndustryUpdateDTO dto) {
        Industry entity = lambdaQuery()
                .eq(Industry::getName, dto.getName()).last("LIMIT 1").one();
        if (entity != null && !ObjUtil.equals(entity.getId(), dto.getId())) {
            return R.failed("修改行业失败, 该行业分类已存在");
        }
        if (ObjUtil.isNull(entity)) {
            entity = getById(dto.getId());
            if (ObjUtil.isNull(entity)) {
                return R.failed("修改行业失败, 无效的行业分类ID");
            }
        }

        CopyOptions copier = CopyOptions.create().ignoreNullValue();
        BeanUtil.copyProperties(dto, entity, copier);
        boolean result = updateById(entity);
        return result ? R.ok() : R.failed("修改行业分类失败");
    }


    /**
     * 获取行业分类列表（分页，支持多条件查询）
     *
     * @param page     分页对象
     * @param queryDTO 查询条件
     * @return 查询结果(行业分类分页列表)
     */
    @Override
    public R<IPage<IndustryVO>> getIndustryList(Page<Industry> page, IndustryQueryDTO queryDTO) {
        // 执行分页查询，支持多条件筛选
        IPage<Industry> entityPage = lambdaQuery()
                // ID 精确查询
                .eq(ObjUtil.isNotNull(queryDTO.getId()), Industry::getId, queryDTO.getId())
                // 名称模糊查询
                .like(StrUtil.isNotBlank(queryDTO.getName()), Industry::getName, queryDTO.getName())
                // 权重精确查询
                .eq(ObjUtil.isNotNull(queryDTO.getWeight()), Industry::getWeight, queryDTO.getWeight())
                // 描述模糊查询
                .like(StrUtil.isNotBlank(queryDTO.getDescription()), Industry::getDescription, queryDTO.getDescription())
                // 是否启用精确查询
                .eq(ObjUtil.isNotNull(queryDTO.getEnable()), Industry::getEnable, queryDTO.getEnable())
                // 创建人ID精确查询
                .eq(ObjUtil.isNotNull(queryDTO.getCreatedBy()), Industry::getCreatedBy, queryDTO.getCreatedBy())
                // 创建时间范围查询
                .ge(ObjUtil.isNotNull(queryDTO.getCreatedTimeStart()), Industry::getCreatedTime, queryDTO.getCreatedTimeStart())
                .le(ObjUtil.isNotNull(queryDTO.getCreatedTimeEnd()), Industry::getCreatedTime, queryDTO.getCreatedTimeEnd())
                // 更新人ID精确查询
                .eq(ObjUtil.isNotNull(queryDTO.getUpdatedBy()), Industry::getUpdatedBy, queryDTO.getUpdatedBy())
                // 更新时间范围查询
                .ge(ObjUtil.isNotNull(queryDTO.getUpdatedTimeStart()), Industry::getUpdatedTime, queryDTO.getUpdatedTimeStart())
                .le(ObjUtil.isNotNull(queryDTO.getUpdatedTimeEnd()), Industry::getUpdatedTime, queryDTO.getUpdatedTimeEnd())
                // 排序：权重升序，创建时间降序
                .orderByAsc(Industry::getWeight)
                .orderByDesc(Industry::getCreatedTime)
                .page(page);
        
        // 转换为 VO 分页对象
        IPage<IndustryVO> voPage = entityPage.convert(entity -> 
            BeanUtil.copyProperties(entity, IndustryVO.class)
        );
        
        return R.ok(voPage);
    }


    /**
     * 根据ID获取行业分类
     *
     * @param industryId 行业分类ID
     * @return 行业分类
     */
    @Override
    public R<IndustryVO> getIndustryById(Long industryId) {
        Industry entity = getById(industryId);
        if (ObjUtil.isNull( entity)) {
            return R.ok(new IndustryVO());
        }
        return R.ok(BeanUtil.copyProperties(entity, IndustryVO.class));
    }


}