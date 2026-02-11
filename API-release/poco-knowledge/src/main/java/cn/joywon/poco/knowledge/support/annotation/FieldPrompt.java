package cn.joywon.poco.knowledge.support.annotation;

import com.fasterxml.jackson.annotation.JacksonAnnotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 字段提示
 *
 * @author poco
 * @date 2024/09/27
 */
@Target({ ElementType.ANNOTATION_TYPE, ElementType.FIELD, })
@Retention(RetentionPolicy.RUNTIME)
@JacksonAnnotation
public @interface FieldPrompt {

	/**
	 * Description of a parameter
	 * @return the description of a parameter
	 */
	String value();

	/**
	 * Whether the parameter is required
	 * @return true if the parameter is required, false otherwise Default is true.
	 */
	boolean required() default true;

}
