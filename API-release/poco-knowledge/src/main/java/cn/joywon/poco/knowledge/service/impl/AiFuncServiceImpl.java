package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.FunctionDTO;
import cn.joywon.poco.knowledge.dto.FunctionFieldDTO;
import cn.joywon.poco.knowledge.entity.AiFuncEntity;
import cn.joywon.poco.knowledge.mapper.AiFuncMapper;
import cn.joywon.poco.knowledge.service.AiFuncService;
import cn.joywon.poco.knowledge.support.constant.FlowNodeTypeEnum;
import cn.joywon.poco.knowledge.support.constant.FunctionTypeEnum;
import cn.joywon.poco.knowledge.support.function.FunctionCalling;
import lombok.RequiredArgsConstructor;
import org.jetbrains.annotations.NotNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ssssssss.magicapi.core.model.DataType;
import org.ssssssss.magicapi.core.model.Group;
import org.ssssssss.magicapi.core.model.MagicEntity;
import org.ssssssss.magicapi.core.model.Parameter;
import org.ssssssss.magicapi.core.service.MagicResourceService;
import org.ssssssss.magicapi.function.model.FunctionInfo;
import org.ssssssss.script.MagicScript;
import org.ssssssss.script.exception.MagicScriptException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * AI功能
 *
 * @author poco
 * @date 2024-07-31 15:39:33
 */
@Service
@RequiredArgsConstructor
public class AiFuncServiceImpl extends ServiceImpl<AiFuncMapper, AiFuncEntity> implements AiFuncService {

    private final MagicResourceService magicResourceService;

    /**
     * The list of FunctionCalling instances used to handle function calls.
     */
    private final List<FunctionCalling> functionCallingList;


    /**
     * 保存 func
     *
     * @param aiFunc AI 函数
     * @return {@link Boolean }
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public AiFuncEntity saveOrUpdateFunc(AiFuncEntity aiFunc) {
        String flowJson = aiFunc.getFlowJson();
        JSONArray nodes = JSONUtil.parseObj(flowJson).getJSONArray("nodes");

        // 分组存在则不创建
        Group group = buildApiGroup();

        for (Object object : nodes) {
            JSONObject node = (JSONObject) object;
            String type = node.getStr("type");

            // 开始节点
            if (FlowNodeTypeEnum.START.getType().equals(type)) {
                JSONObject properties = node.getJSONObject("properties");
                aiFunc.setFuncName(properties.getStr("funcName"));
                aiFunc.setFuncTitle(properties.getStr("funcTitle"));
                aiFunc.setWelcomeMsg(properties.getStr("welcomeMsg"));
            }

            // 函数描述节点
            if (FlowNodeTypeEnum.FUNC_DESC.getType().equals(type)) {
                JSONObject properties = node.getJSONObject("properties");
                aiFunc.setFuncDesc(properties.getStr("funcDesc"));
                String funcDescCode = properties.getStr("funcDescCode");

                if (StrUtil.isBlank(funcDescCode)) {
                    continue;
                }

                String funcTitle = String.format("%s-描述", aiFunc.getFuncTitle());
                String funcName = String.format("%s/desc", aiFunc.getFuncName());
                buildApiFunc(aiFunc, funcTitle, funcName, funcDescCode, group);
            }

            // 执行节点的描述
            if (FlowNodeTypeEnum.EXEC.getType().equals(type)) {
                JSONObject properties = node.getJSONObject("properties");
                aiFunc.setColumnInfo(properties.getStr("fieldList"));
            }

            // 执行任务
            if (FlowNodeTypeEnum.RESULT.getType().equals(type)) {
                JSONObject properties = node.getJSONObject("properties");
                String funcResultCode = properties.getStr("funcResultCode");

                if (StrUtil.isBlank(funcResultCode)) {
                    continue;
                }

                String funcTitle = String.format("%s-结果", aiFunc.getFuncTitle());
                String funcName = String.format("%s/result", aiFunc.getFuncName());
                buildApiFunc(aiFunc, funcTitle, funcName, funcResultCode, group);
            }

        }

        aiFunc.setFuncStatus(YesNoEnum.YES.getCode());
        baseMapper.insertOrUpdate(aiFunc);
        return aiFunc;
    }

    /**
     * 删除 Funcs
     *
     * @param ids id 列表
     * @return {@link Boolean }
     */
    @Override
    public Boolean removeFuncs(Long[] ids) {
        baseMapper.selectBatchIds(CollUtil.toList(ids)).forEach(aiFuncEntity -> {
            // 删除设计器函数
            String resultId = String.format("%s/result", aiFuncEntity.getFuncName());
            magicResourceService.delete(SecureUtil.md5(resultId));
            String descId = String.format("%s/desc", aiFuncEntity.getFuncName());
            magicResourceService.delete(SecureUtil.md5(descId));
        });
        return removeByIds(CollUtil.toList(ids));
    }

    /**
     * 检查脚本
     *
     * @param functionDTO 脚本
     * @return {@link R }
     */
    @Override
    public R checkScript(FunctionDTO functionDTO) {

        try {

            MagicScript magicScript = MagicScript.create(functionDTO.getScript(), null);
            magicScript.compile();
            return R.ok();
        } catch (MagicScriptException e) {
            return R.failed(e.getMessage());
        }
    }

    /**
     * list 函数调用
     *
     * @return {@link R }
     */
    @Override
    public R listFunctionCalling() {
        return R.ok(functionCallingList.stream()
                .filter(FunctionCalling::showFunction)
                .map(functionCalling -> Map.of("funcName", functionCalling.functionName(), "showInfo",
                        functionCalling.showInfo()))
                .collect(Collectors.toList()));
    }

    /**
     * 构建 API func
     *
     * @param aiFunc    AI 函数
     * @param funcTitle func 标题
     * @param funcName  func 名称
     * @param funcCode  func 代码
     * @param group     群
     */
    private void buildApiFunc(AiFuncEntity aiFunc, String funcTitle, String funcName, String funcCode, Group group) {
        // 删除已有的函数，重新插入
        MagicEntity file = magicResourceService.file(SecureUtil.md5(funcName));
        if (Objects.nonNull(file)) {
            magicResourceService.delete(SecureUtil.md5(funcName));
        }
        FunctionInfo apiInfo = new FunctionInfo();
        apiInfo.setId(SecureUtil.md5(funcName));
        apiInfo.setScript(funcCode);
        apiInfo.setName(funcTitle);
        apiInfo.setPath(funcName);
        apiInfo.setGroupId(group.getId());
        apiInfo.setDescription(aiFunc.getFuncDesc());
        // 返回值是字符串
        apiInfo.setReturnType(DataType.Object.name());
        String columnInfo = aiFunc.getColumnInfo();

        if (StrUtil.isNotBlank(columnInfo)) {
            List<FunctionFieldDTO> functionFieldDTOS = JSONUtil.toList(columnInfo, FunctionFieldDTO.class);
            List<Parameter> parameterList = buildApiParams(functionFieldDTOS);
            apiInfo.setParameters(parameterList);
        }

        magicResourceService.saveFile(apiInfo);
    }

    /**
     * 构建 API 参数
     *
     * @param functionFieldDTOList 列数组
     * @return {@link List }<{@link Parameter }>
     */
    private @NotNull List<Parameter> buildApiParams(List<FunctionFieldDTO> functionFieldDTOList) {
        List<Parameter> parameterList = new ArrayList<>();
        for (FunctionFieldDTO fieldDTO : functionFieldDTOList) {
            Parameter parameter = new Parameter();
            parameter.setName(fieldDTO.getAttrName());
            parameter.setDescription(fieldDTO.getFieldComment());
            // 类型转化
            parameter.setType(FunctionTypeEnum.fromInput(fieldDTO.getFormType()).getLowCodeType().getName());
            parameter.setRequired(fieldDTO.isFormRequired());
            parameterList.add(parameter);
        }
        return parameterList;
    }

    /**
     * 构建 API 组
     *
     * @return {@link Group }
     */
    private @NotNull Group buildApiGroup() {
        Group group = magicResourceService.getGroup("1");
        if (Objects.isNull(group)) {
            group = new Group();
            group.setId("1");
            group.setParentId("0");
            group.setName("llm-funcs");
            group.setType("function");
            group.setPath("funcs");
            magicResourceService.saveGroup(group);
        }
        return group;
    }

}
