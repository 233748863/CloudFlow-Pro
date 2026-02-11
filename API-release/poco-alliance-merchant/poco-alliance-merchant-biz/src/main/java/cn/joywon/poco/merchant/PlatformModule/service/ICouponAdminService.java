package cn.joywon.poco.merchant.PlatformModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateAuditDTO;
import cn.joywon.poco.merchant.CouponModule.dto.CouponTemplateAuditListDTO;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateAuditDetailVO;
import cn.joywon.poco.merchant.CouponModule.vo.CouponTemplateAuditListVO;
import com.baomidou.mybatisplus.extension.service.IService;

public interface ICouponAdminService extends IService<CouponTemplate> {


    /**
     * 审核优惠券模板
     *
     * @param dto 优惠券模板审核参数
     * @return 操作结果
     */
    R<?> auditHandle(CouponTemplateAuditDTO dto);


    /**
     * 获取优惠券模板列表
     *
     * @param dto 优惠券模板列表参数
     * @return 查询结果(优惠券模板列表)
     */
    R<PageQueryVO<CouponTemplateAuditListVO>> getList(CouponTemplateAuditListDTO dto);


    /**
     * 获取优惠券模板详情
     *
     * @param couponTemplateId 优惠券模板ID
     * @return 查询结果(优惠券模板详情)
     */
    R<CouponTemplateAuditDetailVO> getDetail(Long couponTemplateId);


}