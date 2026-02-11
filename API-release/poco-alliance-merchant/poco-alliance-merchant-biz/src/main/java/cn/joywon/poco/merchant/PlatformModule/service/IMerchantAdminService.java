package cn.joywon.poco.merchant.PlatformModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.MerchantModule.dto.AuditResultDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantAuditQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.dto.MerchantCreateDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.MerchantAudit;
import cn.joywon.poco.merchant.MerchantModule.vo.AuditStatusVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantAuditDetailVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantAuditListVO;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantDetailVO;
import cn.joywon.poco.merchant.PlatformModule.dto.MerchantCreateByPlatformDTO;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IMerchantAdminService extends IService<MerchantAudit> {


    /**
     * 创建商家平台账号
     *
     * @param dto 商家创建参数
     * @return 操作结果
     */
    MerchantCreateDTO createMerchantPlatformAccount(MerchantCreateByPlatformDTO dto);


    /**
     * 商家信息审核
     *
     * @param dto 审核参数
     * @return 操作结果
     */
    R<?> auditHandle(AuditResultDTO dto);


    /**
     * 获取商家审核列表
     *
     * @param dto 审核列表查询参数
     * @return 查询结果(商家审核列表分页)
     */
    R<PageQueryVO<MerchantAuditListVO>> getAuditList(MerchantAuditQueryDTO dto);


    /**
     * 获取商家详情
     *
     * @param merchantId 商家ID
     * @return 查询结果(商家详情)
     */
    R<MerchantDetailVO> getDetail(Long merchantId);


    /**
     * 获取商家待审核详情
     *
     * @param id 审核记录ID
     * @return 查询结果(商家待审核详情)
     */
    R<MerchantAuditDetailVO> getAuditDetail(Long id);


    /**
     * 商家获取当前审核状态
     *
     * @return 查询结果(当前审核状态)
     */
    R<AuditStatusVO> getAuditStatus();


    /**
     * 获取商家审核历史列表
     *
     * @param dto 审核历史查询参数
     * @return 审核历史列表
     */
    R<PageQueryVO<AuditStatusVO>> getAuditHistoryList(MerchantAuditQueryDTO dto);


    /**
     * 生成商家绑定微信身份二维码
     *
     * @param merchantId 商家ID
     * @return 响应结果
     */
    byte[] generateMerchantBindWxCode(String merchantId);


}