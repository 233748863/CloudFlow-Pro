package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrHeadcountPayload;
import com.cloudflow.hr.domain.dto.HrJobLevelPayload;
import com.cloudflow.hr.domain.dto.HrPositionFamilyPayload;
import com.cloudflow.hr.domain.dto.HrPositionPayload;
import com.cloudflow.hr.domain.entity.HrHeadcount;
import com.cloudflow.hr.domain.entity.HrJobLevel;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.domain.entity.HrPositionFamily;
import com.cloudflow.hr.service.HrOrganizationService;
import com.cloudflow.hr.service.HrTypedCrudService;
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

import java.util.Map;

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
@SaCheckLogin
class HrPositionFamilyController {

    private final HrTypedCrudService crudService;

    @GetMapping("/families")
    public R<?> listFamilies(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPositionFamily.class, query));
    }

    @SysLog("新增HR职族")
    @PostMapping("/families")
    public R<Long> createFamily(@RequestBody HrPositionFamilyPayload payload) {
        return R.ok(crudService.create(HrPositionFamily.class, payload));
    }

    @SysLog("修改HR职族")
    @PutMapping("/families/{id}")
    public R<Void> updateFamily(@PathVariable Long id, @RequestBody HrPositionFamilyPayload payload) {
        crudService.update(HrPositionFamily.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR职族")
    @DeleteMapping("/families/{id}")
    public R<Void> deleteFamily(@PathVariable Long id) {
        crudService.delete(HrPositionFamily.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
@SaCheckLogin
class HrJobLevelController {

    private final HrTypedCrudService crudService;

    @GetMapping("/levels")
    public R<?> listLevels(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrJobLevel.class, query));
    }

    @SysLog("新增HR职级")
    @PostMapping("/levels")
    public R<Long> createLevel(@RequestBody HrJobLevelPayload payload) {
        return R.ok(crudService.create(HrJobLevel.class, payload));
    }

    @SysLog("修改HR职级")
    @PutMapping("/levels/{id}")
    public R<Void> updateLevel(@PathVariable Long id, @RequestBody HrJobLevelPayload payload) {
        crudService.update(HrJobLevel.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR职级")
    @DeleteMapping("/levels/{id}")
    public R<Void> deleteLevel(@PathVariable Long id) {
        crudService.delete(HrJobLevel.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
@SaCheckLogin
class HrPositionController {

    private final HrTypedCrudService crudService;

    @GetMapping("/positions")
    public R<?> listPositions(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrPosition.class, query));
    }

    @SysLog("新增HR岗位")
    @PostMapping("/positions")
    public R<Long> createPosition(@RequestBody HrPositionPayload payload) {
        return R.ok(crudService.create(HrPosition.class, payload));
    }

    @SysLog("修改HR岗位")
    @PutMapping("/positions/{id}")
    public R<Void> updatePosition(@PathVariable Long id, @RequestBody HrPositionPayload payload) {
        crudService.update(HrPosition.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR岗位")
    @DeleteMapping("/positions/{id}")
    public R<Void> deletePosition(@PathVariable Long id) {
        crudService.delete(HrPosition.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/organization")
@RequiredArgsConstructor
@SaCheckLogin
class HrHeadcountController {

    private final HrTypedCrudService crudService;
    private final HrOrganizationService organizationService;

    @GetMapping("/headcounts")
    public R<?> listHeadcounts(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrHeadcount.class, query));
    }

    @SysLog("新增HR编制")
    @PostMapping("/headcounts")
    public R<Long> createHeadcount(@RequestBody HrHeadcountPayload payload) {
        return R.ok(crudService.create(HrHeadcount.class, payload));
    }

    @SysLog("修改HR编制")
    @PutMapping("/headcounts/{id}")
    public R<Void> updateHeadcount(@PathVariable Long id, @RequestBody HrHeadcountPayload payload) {
        crudService.update(HrHeadcount.class, id, payload);
        return R.ok();
    }

    @SysLog("更新HR编制实配人数")
    @PutMapping("/headcounts/{id}/actual-count")
    public R<Void> updateActualCount(@PathVariable Long id, @RequestParam Integer actualCount) {
        organizationService.setHeadcountActualCount(id, actualCount);
        return R.ok();
    }

    @GetMapping("/headcounts/{id}/statistics")
    public R<?> getHeadcountStatistics(@PathVariable Long id) {
        return R.ok(organizationService.getHeadcountStatistics(id));
    }
}
