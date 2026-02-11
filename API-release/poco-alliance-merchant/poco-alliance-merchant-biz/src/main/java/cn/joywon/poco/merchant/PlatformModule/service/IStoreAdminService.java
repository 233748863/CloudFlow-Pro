package cn.joywon.poco.merchant.PlatformModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.dto.AuditResultDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.StoreAudit;
import cn.joywon.poco.merchant.MerchantModule.vo.AuditStatusVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreAuditDetailVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreAuditListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreDetailVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface IStoreAdminService extends IService<StoreAudit> {


    /**
     * 审核门店信息
     *
     * @param dto 审核参数
     * @return 操作结果
     */
    R<?> auditHandle(AuditResultDTO dto);


    /**
     * 查询门店审核列表
     *
     * @param dto 查询参数
     * @return 查询结果(门店审核列表)
     */
    R<PageQueryVO<StoreAuditListVO>> queryAuditList(StoreAuditQueryDTO dto);


    /**
     * 获取审核详情
     *
     * @param id 审核记录ID
     * @return 查询结果(门店审核详情)
     */
    R<StoreAuditDetailVO> getAuditDetail(Long id);


    /**
     * 获取门店详情
     *
     * @param storeId 门店ID
     * @return 查询结果(门店详情)
     */
    R<StoreDetailVO> getDetail(Long storeId);


    /**
     * 获取门店当前审核状态
     *
     * @param storeId 门店ID
     * @return 查询结果(门店当前审核状态)
     */
    R<AuditStatusVO> getAuditStatus(Long storeId);


    /**
     * 获取门店审核历史列表
     *
     * @param storeId  门店ID
     * @param sortDesc 是否按提交审核时间降序排序
     * @return 查询结果(审核历史列表)
     */
    R<List<AuditStatusVO>> getAuditHistoryList(Long storeId, Boolean sortDesc);


}