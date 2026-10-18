package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.domain.dto.ChannelTestDTO;
import com.cloudflow.auth.domain.dto.MessageChannelDTO;
import com.cloudflow.auth.domain.vo.ChannelTestResultVO;
import com.cloudflow.auth.domain.vo.SysMessageChannelVO;
import com.cloudflow.auth.service.MessageChannelService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 消息渠道管理。
 */
@RestController
@RequestMapping("/system/message/channel")
@RequiredArgsConstructor
public class SysMessageChannelController {
    private final MessageChannelService service;
    private final ObjectMapper json;

    @GetMapping("/list")
    @SaCheckPermission("system:message:channel:list")
    public R<PageResult<SysMessageChannelVO>> list(@RequestParam(required = false) String channelType,
                                                   @RequestParam(required = false) String status,
                                                   @RequestParam(defaultValue = "1") Integer pageNum,
                                                   @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(service.list(channelType, status, pageNum, pageSize));
    }

    @GetMapping("/{channelId}")
    @SaCheckPermission("system:message:channel:list")
    public R<JsonNode> getInfo(@PathVariable Long channelId) {
        SysMessageChannelVO channel = service.get(channelId);
        ObjectNode document = json.valueToTree(channel);
        if (StpUtil.hasPermission("system:message:channel:edit")) {
            document.put("fromAddress", channel.getFromAddress());
        }
        return R.ok(document);
    }

    @SysLog("新增消息渠道")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("system:message:channel:add")
    public R<Void> add(@RequestBody @Valid MessageChannelDTO dto) {
        service.add(dto);
        return R.ok();
    }

    @SysLog("修改消息渠道")
    @PutMapping
    @SaCheckPermission("system:message:channel:edit")
    public R<Void> edit(@RequestBody @Valid MessageChannelDTO dto) {
        service.edit(dto);
        return R.ok();
    }

    @SysLog("测试消息渠道连通性")
    @RepeatSubmit.Disabled
    @PostMapping("/{channelId}/test")
    @SaCheckPermission("system:message:channel:edit")
    public R<ChannelTestResultVO> test(@PathVariable Long channelId, @RequestBody(required = false) ChannelTestDTO dto) {
        return R.ok(service.test(channelId, dto));
    }

    @SysLog("删除消息渠道")
    @DeleteMapping("/{channelIds}")
    @SaCheckPermission("system:message:channel:remove")
    public R<Void> remove(@PathVariable List<Long> channelIds) {
        service.remove(channelIds);
        return R.ok();
    }
}
