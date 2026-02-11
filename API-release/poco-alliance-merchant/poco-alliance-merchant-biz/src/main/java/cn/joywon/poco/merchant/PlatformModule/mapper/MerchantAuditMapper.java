package cn.joywon.poco.merchant.PlatformModule.mapper;

import cn.joywon.poco.merchant.MerchantModule.dto.MerchantAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.MerchantAudit;
import cn.joywon.poco.merchant.MerchantModule.vo.AuditStatusVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantAuditListVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MerchantAuditMapper extends MPJBaseMapper<MerchantAudit> {


    /**
     * 获取商家审核列表
     *
     * @param page 分页参数
     * @param dto  审核列表查询参数
     * @return 商家审核分页列表
     */
    Page<MerchantAuditListVO> getAuditList(@Param("page") Page<MerchantAuditListVO> page,
                                           @Param("dto") MerchantAuditQueryDTO dto);


    /**
     * 获取商家审核历史列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 审核历史列表
     */
    Page<AuditStatusVO> getAuditHistoryList(@Param("page") Page<AuditStatusVO> page,
                                            @Param("dto") MerchantAuditQueryDTO dto);


}