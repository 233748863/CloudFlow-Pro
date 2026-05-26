package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrTrainingCategoryPayload;
import com.cloudflow.hr.domain.dto.HrTrainingCoursePayload;
import com.cloudflow.hr.domain.dto.HrTrainingInstructorPayload;
import com.cloudflow.hr.domain.dto.HrTrainingPlanPayload;
import com.cloudflow.hr.domain.dto.HrTrainingSessionPayload;
import com.cloudflow.hr.domain.dto.training.HrTrainingCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrTrainingCategory;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.domain.entity.HrTrainingInstructor;
import com.cloudflow.hr.domain.entity.HrTrainingPlan;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import com.cloudflow.hr.domain.vo.training.HrTrainingCategoryVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingCourseVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingInstructorVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingPlanVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingSessionStatusVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingSessionVO;
import com.cloudflow.hr.service.HrTrainingService;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 培训管理基础资源控制器：计划 / 分类 / 讲师 / 课程 / 班次。
 *
 * <p>报名 / 考试 / 证书 / 档案落在其它子文件，按业务域拆分。基础 CRUD 走泛型
 * {@link HrTypedCrudService}，少量带容量校验 / 状态机的接口下沉到 {@link HrTrainingService}。
 */
@RestController
@RequestMapping("/training/plans")
@RequiredArgsConstructor
class HrTrainingPlanController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:plan:list")
    public R<PageResult<HrTrainingPlanVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingPlan.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingPlanVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:plan:list")
    public R<HrTrainingPlanVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrTrainingPlan.class, id),
                HrTrainingPlanVO.class, objectMapper));
    }

    @SysLog("新增HR培训计划")
    @PostMapping
    @SaCheckPermission("hr:training:plan:add")
    public R<Long> create(@RequestBody HrTrainingPlanPayload payload) {
        return R.ok(crudService.create(HrTrainingPlan.class, payload));
    }

    @SysLog("修改HR培训计划")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:plan:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrTrainingPlanPayload payload) {
        crudService.update(HrTrainingPlan.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR培训计划")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:plan:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTrainingPlan.class, id);
        return R.ok();
    }

    @SysLog("HR培训计划状态变更")
    @PostMapping("/{id}/{action}")
    @SaCheckPermission("hr:training:plan:edit")
    public R<Void> changeStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrTrainingPlan.class, id, action);
        return R.ok();
    }
}

@RestController
@RequestMapping("/training/categories")
@RequiredArgsConstructor
class HrTrainingCategoryController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:course:list")
    public R<List<HrTrainingCategoryVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrTrainingCategory.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingCategoryVO.class, objectMapper));
    }

    @SysLog("新增HR培训分类")
    @PostMapping
    @SaCheckPermission("hr:training:course:add")
    public R<Long> create(@RequestBody HrTrainingCategoryPayload payload) {
        return R.ok(crudService.create(HrTrainingCategory.class, payload));
    }

    @SysLog("修改HR培训分类")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:course:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrTrainingCategoryPayload payload) {
        crudService.update(HrTrainingCategory.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR培训分类")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:course:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTrainingCategory.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/training/instructors")
@RequiredArgsConstructor
class HrTrainingInstructorController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:course:list")
    public R<PageResult<HrTrainingInstructorVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingInstructor.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingInstructorVO.class, objectMapper));
    }

    @SysLog("新增HR培训讲师")
    @PostMapping
    @SaCheckPermission("hr:training:course:add")
    public R<Long> create(@RequestBody HrTrainingInstructorPayload payload) {
        return R.ok(crudService.create(HrTrainingInstructor.class, payload));
    }

    @SysLog("修改HR培训讲师")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:course:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrTrainingInstructorPayload payload) {
        crudService.update(HrTrainingInstructor.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR培训讲师")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:course:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTrainingInstructor.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/training/courses")
@RequiredArgsConstructor
class HrTrainingCourseController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:course:list")
    public R<PageResult<HrTrainingCourseVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingCourse.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingCourseVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:course:list")
    public R<HrTrainingCourseVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrTrainingCourse.class, id),
                HrTrainingCourseVO.class, objectMapper));
    }

    @SysLog("新增HR培训课程")
    @PostMapping
    @SaCheckPermission("hr:training:course:add")
    public R<Long> create(@RequestBody HrTrainingCoursePayload payload) {
        return R.ok(crudService.create(HrTrainingCourse.class, payload));
    }

    @SysLog("修改HR培训课程")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:course:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrTrainingCoursePayload payload) {
        crudService.update(HrTrainingCourse.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR培训课程")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:course:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTrainingCourse.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/training/sessions")
@RequiredArgsConstructor
class HrTrainingSessionController {

    private final HrTypedCrudService crudService;
    private final HrTrainingService trainingService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:session:list")
    public R<PageResult<HrTrainingSessionVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingSession.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingSessionVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:session:list")
    public R<HrTrainingSessionVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrTrainingSession.class, id),
                HrTrainingSessionVO.class, objectMapper));
    }

    @SysLog("新建HR培训班次")
    @PostMapping
    @SaCheckPermission("hr:training:session:add")
    public R<Long> create(@RequestBody HrTrainingSessionPayload payload) {
        return R.ok(trainingService.createSession(payload));
    }

    @SysLog("修改HR培训班次")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:session:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrTrainingSessionPayload payload) {
        crudService.update(HrTrainingSession.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR培训班次")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:session:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTrainingSession.class, id);
        return R.ok();
    }

    @SysLog("HR培训班次状态变更")
    @PostMapping("/{id}/{action}")
    @SaCheckPermission("hr:training:session:edit")
    public R<HrTrainingSessionStatusVO> changeStatus(@PathVariable Long id, @PathVariable String action) {
        return R.ok(new HrTrainingSessionStatusVO(trainingService.changeSessionStatus(id, action)));
    }
}
