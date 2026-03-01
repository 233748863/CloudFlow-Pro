package com.cloudflow.workflow.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * 版本号生成器测试类
 */
class VersionNumberGeneratorTest {

    @Test
    void testSemanticVersionParse() {
        // 测试正常解析
        VersionNumberGenerator.SemanticVersion version = VersionNumberGenerator.SemanticVersion.parse("1.2.3");
        assertEquals(1, version.getMajor());
        assertEquals(2, version.getMinor());
        assertEquals(3, version.getPatch());
        assertEquals("1.2.3", version.toString());
    }

    @Test
    void testSemanticVersionParseInvalid() {
        // 测试无效格式
        assertThrows(IllegalArgumentException.class, () -> 
            VersionNumberGenerator.SemanticVersion.parse("1.2"));
        
        assertThrows(IllegalArgumentException.class, () -> 
            VersionNumberGenerator.SemanticVersion.parse("1.2.3.4"));
        
        assertThrows(IllegalArgumentException.class, () -> 
            VersionNumberGenerator.SemanticVersion.parse("a.b.c"));
        
        assertThrows(IllegalArgumentException.class, () -> 
            VersionNumberGenerator.SemanticVersion.parse(""));
        
        assertThrows(IllegalArgumentException.class, () -> 
            VersionNumberGenerator.SemanticVersion.parse(null));
    }

    @Test
    void testIncrementMajor() {
        VersionNumberGenerator.SemanticVersion version = VersionNumberGenerator.SemanticVersion.parse("1.2.3");
        VersionNumberGenerator.SemanticVersion newVersion = version.incrementMajor();
        assertEquals("2.0.0", newVersion.toString());
    }

    @Test
    void testIncrementMinor() {
        VersionNumberGenerator.SemanticVersion version = VersionNumberGenerator.SemanticVersion.parse("1.2.3");
        VersionNumberGenerator.SemanticVersion newVersion = version.incrementMinor();
        assertEquals("1.3.0", newVersion.toString());
    }

    @Test
    void testIncrementPatch() {
        VersionNumberGenerator.SemanticVersion version = VersionNumberGenerator.SemanticVersion.parse("1.2.3");
        VersionNumberGenerator.SemanticVersion newVersion = version.incrementPatch();
        assertEquals("1.2.4", newVersion.toString());
    }

    @Test
    void testCompareVersions() {
        assertTrue(VersionNumberGenerator.compareVersions("1.0.0", "2.0.0") < 0);
        assertTrue(VersionNumberGenerator.compareVersions("2.0.0", "1.0.0") > 0);
        assertEquals(0, VersionNumberGenerator.compareVersions("1.2.3", "1.2.3"));
        
        assertTrue(VersionNumberGenerator.compareVersions("1.2.0", "1.3.0") < 0);
        assertTrue(VersionNumberGenerator.compareVersions("1.2.3", "1.2.4") < 0);
    }

    @Test
    void testGenerateNextVersion() {
        // 测试主版本递增
        String nextMajor = VersionNumberGenerator.generateNextVersion("1.2.3", 
            VersionNumberGenerator.ChangeType.MAJOR);
        assertEquals("2.0.0", nextMajor);

        // 测试次版本递增
        String nextMinor = VersionNumberGenerator.generateNextVersion("1.2.3", 
            VersionNumberGenerator.ChangeType.MINOR);
        assertEquals("1.3.0", nextMinor);

        // 测试修订版本递增
        String nextPatch = VersionNumberGenerator.generateNextVersion("1.2.3", 
            VersionNumberGenerator.ChangeType.PATCH);
        assertEquals("1.2.4", nextPatch);
    }

    @Test
    void testIsValidVersion() {
        assertTrue(VersionNumberGenerator.isValidVersion("1.0.0"));
        assertTrue(VersionNumberGenerator.isValidVersion("10.20.30"));
        
        assertFalse(VersionNumberGenerator.isValidVersion("1.0"));
        assertFalse(VersionNumberGenerator.isValidVersion("1.0.0.0"));
        assertFalse(VersionNumberGenerator.isValidVersion("a.b.c"));
        assertFalse(VersionNumberGenerator.isValidVersion(""));
        assertFalse(VersionNumberGenerator.isValidVersion(null));
    }

    @Test
    void testDetectChangeType() {
        // 测试结构性变更（新增关键节点）
        String oldDef = "{\"nodes\":[{\"id\":\"1\",\"type\":\"start\"},{\"id\":\"2\",\"type\":\"end\"}],\"edges\":[{\"source\":\"1\",\"target\":\"2\"}]}";
        String newDef = "{\"nodes\":[{\"id\":\"1\",\"type\":\"start\"},{\"id\":\"3\",\"type\":\"approval\"},{\"id\":\"2\",\"type\":\"end\"}],\"edges\":[{\"source\":\"1\",\"target\":\"3\"},{\"source\":\"3\",\"target\":\"2\"}]}";
        
        VersionNumberGenerator.ChangeType changeType = VersionNumberGenerator.detectChangeType(oldDef, newDef);
        assertEquals(VersionNumberGenerator.ChangeType.MAJOR, changeType);
    }

    @Test
    void testDetectChangeTypeMinor() {
        // 测试配置变更
        String oldDef = "{\"nodes\":[{\"id\":\"1\",\"type\":\"start\",\"config\":{\"timeout\":30}},{\"id\":\"2\",\"type\":\"end\"}],\"edges\":[{\"source\":\"1\",\"target\":\"2\"}]}";
        String newDef = "{\"nodes\":[{\"id\":\"1\",\"type\":\"start\",\"config\":{\"timeout\":60}},{\"id\":\"2\",\"type\":\"end\"}],\"edges\":[{\"source\":\"1\",\"target\":\"2\"}]}";
        
        VersionNumberGenerator.ChangeType changeType = VersionNumberGenerator.detectChangeType(oldDef, newDef);
        assertEquals(VersionNumberGenerator.ChangeType.MINOR, changeType);
    }

    @Test
    void testDetectChangeTypePatch() {
        // 测试小修改（相同的定义）
        String oldDef = "{\"nodes\":[{\"id\":\"1\",\"type\":\"start\"},{\"id\":\"2\",\"type\":\"end\"}],\"edges\":[{\"source\":\"1\",\"target\":\"2\"}]}";
        String newDef = "{\"nodes\":[{\"id\":\"1\",\"type\":\"start\"},{\"id\":\"2\",\"type\":\"end\"}],\"edges\":[{\"source\":\"1\",\"target\":\"2\"}]}";
        
        VersionNumberGenerator.ChangeType changeType = VersionNumberGenerator.detectChangeType(oldDef, newDef);
        assertEquals(VersionNumberGenerator.ChangeType.PATCH, changeType);
    }

    @Test
    void testChangeTypeFromValue() {
        assertEquals(VersionNumberGenerator.ChangeType.MAJOR, 
            VersionNumberGenerator.ChangeType.fromValue("major"));
        assertEquals(VersionNumberGenerator.ChangeType.MINOR, 
            VersionNumberGenerator.ChangeType.fromValue("minor"));
        assertEquals(VersionNumberGenerator.ChangeType.PATCH, 
            VersionNumberGenerator.ChangeType.fromValue("patch"));
        
        assertThrows(IllegalArgumentException.class, () -> 
            VersionNumberGenerator.ChangeType.fromValue("invalid"));
    }
}
