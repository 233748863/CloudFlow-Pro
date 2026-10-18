package com.cloudflow.hr.config;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.json.SaJsonTemplateForJackson;
import cn.dev33.satoken.serializer.impl.SaSerializerTemplateForJson;
import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.session.SaTerminalInfo;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.idempotent.support.RepeatSubmitKeyResolver;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.core.GenericTypeResolver;
import org.springframework.core.MethodParameter;
import org.springframework.core.ResolvableType;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@Component
@RequiredArgsConstructor
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class HrRequestMetadataInitializer implements SmartInitializingSingleton {
    private final ObjectProvider<RequestMappingHandlerMapping> handlerMappings;
    private final ObjectProvider<RequestMappingHandlerAdapter> handlerAdapters;
    private final ObjectProvider<ObjectMapper> objectMappers;
    private final ObjectProvider<RepeatSubmitKeyResolver> repeatSubmitResolvers;
    private final ObjectProvider<RedisTemplate<?, ?>> redisTemplates;
    private final ObjectProvider<Validator> validators;

    @Override
    public void afterSingletonsInstantiated() {
        prepareSessionMetadata();
        prepareRedisMetadata();
        Set<ObjectMapper> mappers = Collections.newSetFromMap(new IdentityHashMap<>());
        objectMappers.forEach(mappers::add);
        for (RequestMappingHandlerAdapter adapter : handlerAdapters) {
            for (HttpMessageConverter<?> converter : adapter.getMessageConverters()) {
                if (converter instanceof MappingJackson2HttpMessageConverter json) {
                    mappers.add(json.getObjectMapper());
                }
            }
        }
        Set<Type> requestTypes = new LinkedHashSet<>();
        for (RequestMappingHandlerMapping mapping : handlerMappings) {
            for (HandlerMethod handler : mapping.getHandlerMethods().values()) {
                for (MethodParameter parameter : handler.getMethodParameters()) {
                    if (parameter.hasParameterAnnotation(RequestBody.class)) {
                        MethodParameter body = parameter.nestedIfOptional();
                        requestTypes.add(GenericTypeResolver.resolveType(
                                body.getNestedGenericParameterType(), body.getContainingClass()));
                    }
                }
            }
        }
        for (ObjectMapper mapper : mappers) {
            mapper.canDeserialize(mapper.constructType(JsonNode.class));
            for (Type requestType : requestTypes) {
                JavaType resolved = mapper.constructType(requestType);
                mapper.canDeserialize(resolved);
                mapper.canSerialize(resolved.getRawClass());
            }
        }
        for (RepeatSubmitKeyResolver resolver : repeatSubmitResolvers) {
            resolver.prepareRequestTypes(requestTypes);
        }
        for (Validator validator : validators) {
            for (Type requestType : requestTypes) {
                Class<?> requestClass = ResolvableType.forType(requestType).resolve();
                if (requestClass != null) validator.getConstraintsForClass(requestClass);
            }
        }
    }

    private void prepareSessionMetadata() {
        if (SaManager.getSaSerializerTemplate().getClass() != SaSerializerTemplateForJson.class) return;
        if (SaManager.getSaJsonTemplate() instanceof SaJsonTemplateForJackson template) {
            prepareContainerMetadata(template.objectMapper);
            for (Class<?> sessionType : List.of(SaSession.class, SaTerminalInfo.class)) {
                template.objectMapper.canDeserialize(template.objectMapper.constructType(sessionType));
                template.objectMapper.canSerialize(sessionType);
            }
            template.objectMapper.canDeserialize(template.objectMapper.getTypeFactory()
                    .constructCollectionType(CopyOnWriteArrayList.class, SaTerminalInfo.class));
        }
    }

    private void prepareRedisMetadata() {
        Set<RedisSerializer<?>> serializers = Collections.newSetFromMap(new IdentityHashMap<>());
        for (RedisTemplate<?, ?> template : redisTemplates) {
            serializers.add(template.getValueSerializer());
            serializers.add(template.getHashValueSerializer());
        }
        for (RedisSerializer<?> serializer : serializers) {
            if (serializer != null && serializer.getClass() == GenericJackson2JsonRedisSerializer.class) {
                ((GenericJackson2JsonRedisSerializer) serializer).configure(mapper -> {
                    prepareContainerMetadata(mapper);
                    mapper.canDeserialize(mapper.constructType(JsonNode.class));
                    mapper.canDeserialize(mapper.constructType(UserDataScopeSnapshot.class));
                    mapper.canSerialize(UserDataScopeSnapshot.class);
                });
            }
        }
    }

    private void prepareContainerMetadata(ObjectMapper mapper) {
        for (Class<?> container : List.of(ArrayList.class, CopyOnWriteArrayList.class, HashSet.class,
                LinkedHashSet.class, HashMap.class, LinkedHashMap.class, ConcurrentHashMap.class, TreeMap.class)) {
            mapper.canDeserialize(mapper.constructType(container));
            mapper.canSerialize(container);
        }
        JavaType stringMap = mapper.getTypeFactory().constructMapType(Map.class, String.class, Object.class);
        for (Class<?> mapType : List.of(HashMap.class, LinkedHashMap.class, ConcurrentHashMap.class)) {
            mapper.canDeserialize(mapper.getTypeFactory().constructSpecializedType(stringMap, mapType));
        }
    }
}
