package cn.joywon.poco.knowledge.support.util;

import cn.joywon.poco.knowledge.dto.FunctionFieldDTO;
import cn.joywon.poco.knowledge.support.annotation.FieldPrompt;
import cn.joywon.poco.knowledge.support.constant.FunctionTypeEnum;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.request.json.JsonSchemaElement;
import dev.langchain4j.model.chat.request.json.JsonSchemaElementHelper;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ToolSpecificationsUtils {

	private ToolSpecificationsUtils() {
	}

	/**
	 * 使用 {@link FunctionFieldDTO} 构建 json schema
	 * @param functionFieldDTOS 函数字段 DTOS
	 * @return {@link JsonObjectSchema }
	 */
	public static JsonObjectSchema parametersFrom(List<FunctionFieldDTO> functionFieldDTOS) {

		Map<String, JsonSchemaElement> properties = new LinkedHashMap<>();
		List<String> required = new ArrayList<>();

		Map<Class<?>, JsonSchemaElementHelper.VisitedClassMetadata> visited = new LinkedHashMap<>();

		for (FunctionFieldDTO field : functionFieldDTOS) {

			properties.put(field.getAttrName(), jsonSchemaElementFrom(field, visited));
			if (field.isFormRequired()) {
				required.add(field.getAttrName());
			}
		}

		Map<String, JsonSchemaElement> definitions = new LinkedHashMap<>();
		visited.forEach((clazz, visitedClassMetadata) -> {
			if (visitedClassMetadata.recursionDetected) {
				definitions.put(visitedClassMetadata.reference, visitedClassMetadata.jsonSchemaElement);
			}
		});

		if (properties.isEmpty()) {
			return null;
		}

		return JsonObjectSchema.builder()
			.properties(properties)
			.required(required)
			.definitions(definitions.isEmpty() ? null : definitions)
			.build();
	}

	/**
	 * 使用反射的Field 构建 json schema
	 * @param fields 领域
	 * @return {@link JsonObjectSchema }
	 */
	public static JsonObjectSchema parametersFrom(Field[] fields) {

		Map<String, JsonSchemaElement> properties = new LinkedHashMap<>();
		List<String> required = new ArrayList<>();

		Map<Class<?>, JsonSchemaElementHelper.VisitedClassMetadata> visited = new LinkedHashMap<>();

		for (Field field : fields) {
			FieldPrompt fieldPrompt = field.getAnnotation(FieldPrompt.class);

			if (fieldPrompt == null) {
				continue;
			}

			boolean isRequired = fieldPrompt.required();

			properties.put(field.getName(), jsonSchemaElementFrom(field, fieldPrompt.value(), visited));
			if (isRequired) {
				required.add(field.getName());
			}
		}

		Map<String, JsonSchemaElement> definitions = new LinkedHashMap<>();
		visited.forEach((clazz, visitedClassMetadata) -> {
			if (visitedClassMetadata.recursionDetected) {
				definitions.put(visitedClassMetadata.reference, visitedClassMetadata.jsonSchemaElement);
			}
		});

		if (properties.isEmpty()) {
			return null;
		}

		return JsonObjectSchema.builder()
			.properties(properties)
			.required(required)
			.definitions(definitions.isEmpty() ? null : definitions)
			.build();
	}

	/**
	 * JSON 架构元素
	 * @param field 字段
	 * @param visited 存储 map
	 */
	private static JsonSchemaElement jsonSchemaElementFrom(FunctionFieldDTO field,
			Map<Class<?>, JsonSchemaElementHelper.VisitedClassMetadata> visited) {
		FunctionTypeEnum fieldTypeEnum = FunctionTypeEnum.fromInput(field.getFormType());
		return JsonSchemaElementHelper.jsonSchemaElementFrom(fieldTypeEnum.getLowCodeType(), String.class,
				field.getFieldComment(), visited);
	}

	/**
	 * JSON 架构元素
	 * @param field 反射字段
	 * @param description 描述
	 * @param visited 存储 map
	 * @return {@link JsonSchemaElement }
	 */
	private static JsonSchemaElement jsonSchemaElementFrom(Field field, String description,
			Map<Class<?>, JsonSchemaElementHelper.VisitedClassMetadata> visited) {
		return JsonSchemaElementHelper.jsonSchemaElementFrom(field.getType(), field.getGenericType(), description,
				visited);
	}

}
