package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrHeadcountPayload;
import com.cloudflow.hr.domain.dto.HrJobLevelPayload;
import com.cloudflow.hr.domain.dto.HrPositionFamilyPayload;
import com.cloudflow.hr.domain.dto.HrPositionPayload;
import com.cloudflow.hr.domain.dto.organization.HrOrganizationCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrHeadcount;
import com.cloudflow.hr.domain.entity.HrJobLevel;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.domain.entity.HrPositionFamily;
import com.cloudflow.hr.service.HrOrganizationService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
class HrPositionFamilyController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/families")
    @SaCheckPermission("hr:organization:list")
    public R<?> listFamilies(@Validated @ModelAttribute HrOrganizationCommonQueryDTO query) {
        return R.ok(crudService.list(HrPositionFamily.class,
                MapConverters.toServiceQuery(query, objectMapper)));
    }

    @SysLog("新增HR职族")
    @PostMapping("/families")
    @SaCheckPermission("hr:organization:add")
    public R<Long> createFamily(@RequestBody HrPositionFamilyPayload payload) {
        return R.ok(crudService.create(HrPositionFamily.class, payload));
    }

    @SysLog("修改HR职族")
    @PutMapping("/families/{id}")
    @SaCheckPermission("hr:organization:edit")
    public R<Void> updateFamily(@PathVariable Long id, @RequestBody HrPositionFamilyPayload payload) {
        crudService.update(HrPositionFamily.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR职族")
    @DeleteMapping("/families/{id}")
    @SaCheckPermission("hr:organization:remove")
    public R<Void> deleteFamily(@PathVariable Long id) {
        crudService.delete(HrPositionFamily.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
class HrJobLevelController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/levels")
    @SaCheckPermission("hr:organization:list")
    public R<?> listLevels(@Validated @ModelAttribute HrOrganizationCommonQueryDTO query) {
        return R.ok(crudService.list(HrJobLevel.class,
                MapConverters.toServiceQuery(query, objectMapper)));
    }

    @SysLog("新增HR职级")
    @PostMapping("/levels")
    @SaCheckPermission("hr:organization:add")
    public R<Long> createLevel(@RequestBody HrJobLevelPayload payload) {
        return R.ok(crudService.create(HrJobLevel.class, payload));
    }

    @SysLog("修改HR职级")
    @PutMapping("/levels/{id}")
    @SaCheckPermission("hr:organization:edit")
    public R<Void> updateLevel(@PathVariable Long id, @RequestBody HrJobLevelPayload payload) {
        crudService.update(HrJobLevel.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR职级")
    @DeleteMapping("/levels/{id}")
    @SaCheckPermission("hr:organization:remove")
    public R<Void> deleteLevel(@PathVariable Long id) {
        crudService.delete(HrJobLevel.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
class HrPositionController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/positions")
    @SaCheckPermission("hr:organization:list")
    public R<?> listPositions(@Validated @ModelAttribute HrOrganizationCommonQueryDTO query) {
        return R.ok(crudService.list(HrPosition.class,
                MapConverters.toServiceQuery(query, objectMapper)));
    }

    @SysLog("新增HR岗位")
    @PostMapping("/positions")
    @SaCheckPermission("hr:organization:add")
    public R<Long> createPosition(@RequestBody HrPositionPayload payload) {
        return R.ok(crudService.create(HrPosition.class, payload));
    }

    @SysLog("修改HR岗位")
    @PutMapping("/positions/{id}")
    @SaCheckPermission("hr:organization:edit")
    public R<Void> updatePosition(@PathVariable Long id, @RequestBody HrPositionPayload payload) {
        crudService.update(HrPosition.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR岗位")
    @DeleteMapping("/positions/{id}")
    @SaCheckPermission("hr:organization:remove")
    public R<Void> deletePosition(@PathVariable Long id) {
        crudService.delete(HrPosition.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
class HrHeadcountController {

    private final HrTypedCrudService crudService;
    private final HrOrganizationService organizationService;
    private final ObjectMapper objectMapper;

    @GetMapping("/headcounts")
    @SaCheckPermission("hr:organization:list")
    public R<?> listHeadcounts(@Validated @ModelAttribute HrOrganizationCommonQueryDTO query) {
        return R.ok(crudService.list(HrHeadcount.class,
                MapConverters.toServiceQuery(query, objectMapper)));
    }

    @SysLog("新增HR编制")
    @PostMapping("/headcounts")
    @SaCheckPermission("hr:organization:add")
    public R<Long> createHeadcount(@RequestBody HrHeadcountPayload payload) {
        return R.ok(crudService.create(HrHeadcount.class, payload));
    }

    @SysLog("修改HR编制")
    @PutMapping("/headcounts/{id}")
    @SaCheckPermission("hr:organization:edit")
    public R<Void> updateHeadcount(@PathVariable Long id, @RequestBody HrHeadcountPayload payload) {
        crudService.update(HrHeadcount.class, id, payload);
        return R.ok();
    }

    @SysLog("更新HR编制实配人数")
    @PutMapping("/headcounts/{id}/actual-count")
    @SaCheckPermission("hr:organization:edit")
    public R<Void> updateActualCount(@PathVariable Long id, @RequestParam Integer actualCount) {
        organizationService.setHeadcountActualCount(id, actualCount);
        return R.ok();
    }

    @GetMapping("/headcounts/{id}/statistics")
    @SaCheckPermission("hr:organization:view")
    public R<?> getHeadcountStatistics(@PathVariable Long id) {
        return R.ok(organizationService.getHeadcountStatistics(id));
    }
}
