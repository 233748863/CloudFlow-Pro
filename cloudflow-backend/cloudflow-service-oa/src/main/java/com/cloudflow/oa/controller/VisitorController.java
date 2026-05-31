package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.oa.domain.Visitor;
import com.cloudflow.oa.service.IVisitorService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

/**
 * 访客管理 Controller
 * 前端请求路径：/oa/visitor/xxx → 网关 StripPrefix=1 → /visitor/xxx
 */
@RestController
@RequestMapping("/visitor")
@RequiredArgsConstructor
public class VisitorController {

    private final IVisitorService visitorService;

    /** 分页查询访客列表 */
    @GetMapping("/list")
    @SaCheckPermission("oa:visitor:list")
    public R list(Visitor query,
                  @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                  @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        IPage<Visitor> page = visitorService.queryPage(query, pageNum, pageSize);
        return R.ok(page);
    }

    /** 获取详情 */
    @GetMapping("/{id}")
    @SaCheckPermission("oa:visitor:list")
    public R getInfo(@PathVariable("id") Long id) {
        Visitor visitor = visitorService.getById(id);
        return visitor != null ? R.ok(visitor) : R.fail("访客记录不存在");
    }

    /** 新增访客预约 */
    @SysLog("新增访客预约")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:visitor:add")
    public R add(@RequestBody Visitor visitor) {
        // 填充当前登录用户信息作为创建者
        visitor.setCreateBy(UserContext.getUserName());
        visitor.setStatus("PENDING");
        return R.result(visitorService.save(visitor));
    }

    /** 修改访客信息 */
    @SysLog("修改访客信息")
    @PutMapping
    @SaCheckPermission("oa:visitor:edit")
    public R edit(@RequestBody Visitor visitor) {
        if (visitor.getVisitorId() == null) {
            return R.fail("访客ID不能为空");
        }
        return R.result(visitorService.updateById(visitor));
    }

    /** 删除访客记录 */
    @SysLog("删除访客记录")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:visitor:remove")
    public R remove(@PathVariable("ids") List<Long> ids) {
        return R.result(visitorService.removeBatchByIds(ids));
    }

    /** 确认访客预约 */
    @SysLog("确认访客预约")
    @PutMapping("/confirm/{id}")
    @SaCheckPermission("oa:visitor:confirm")
    public R confirm(@PathVariable("id") Long id) {
        return R.result(visitorService.confirmVisitor(id));
    }

    /** 访客签到 */
    @SysLog("访客签到")
    @PutMapping("/checkin/{id}")
    @SaCheckPermission("oa:visitor:checkin")
    public R checkIn(@PathVariable("id") Long id) {
        return R.result(visitorService.checkInVisitor(id));
    }

    /** 访客签退 */
    @SysLog("访客签退")
    @PutMapping("/checkout/{id}")
    @SaCheckPermission("oa:visitor:checkout")
    public R checkOut(@PathVariable("id") Long id) {
        return R.result(visitorService.checkOutVisitor(id));
    }

    /** 取消访客预约 */
    @SysLog("取消访客预约")
    @PutMapping("/cancel/{id}")
    @SaCheckPermission("oa:visitor:cancel")
    public R cancel(@PathVariable("id") Long id) {
        return R.result(visitorService.cancelVisitor(id));
    }

    /** 生成访客通行二维码 */
    @GetMapping("/{id}/qrcode")
    @SaCheckPermission("oa:visitor:list")
    public void getQrCode(@PathVariable("id") Long id, HttpServletResponse response) throws IOException {
        response.setContentType("image/png");
        visitorService.generateQrCode(id, response.getOutputStream());
    }
}

