package cn.joywon.poco.merchant.PlatformModule.mapper;

import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.PointsRule;
import cn.joywon.poco.merchant.PlatformModule.vo.PointsRuleListVO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PointsRuleMapper extends BaseMapper<PointsRule> {


    /**
     * 删除积分规则
     *
     * @param id 积分规则ID
     * @return 删除结果
     */
    int deletePointsRule(@Param("id") Long id);


    /**
     * 查询积分规则列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 积分规则列表
     */
    Page<PointsRuleListVO> queryPointsRulesList(@Param("page") Page<PointsRuleListVO> page,
                                                @Param("dto") PointsRuleQueryDTO dto);


}