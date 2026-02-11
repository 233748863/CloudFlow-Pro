package cn.joywon.poco.merchant.PlatformModule.mapper;

import cn.joywon.poco.merchant.MerchantModule.dto.StoreAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.StoreAudit;
import cn.joywon.poco.merchant.MerchantModule.vo.AuditStatusVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreAuditListVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface StoreAuditMapper extends MPJBaseMapper<StoreAudit> {


    /**
     * 查询门店审核列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 查询结果
     */
    Page<StoreAuditListVO> queryAuditList(@Param("page") Page<StoreAuditListVO> page,
                                          @Param("dto") StoreAuditQueryDTO dto);


    /**
     * 查询门店审核历史列表
     *
     * @param storeId 门店ID
     * @param sortDesc 是否按提交审核时间降序排序
     * @return 审核历史列表
     */
    List<AuditStatusVO> getAuditHistoryList(@Param("storeId") Long storeId, @Param("sortDesc") Boolean sortDesc);


}