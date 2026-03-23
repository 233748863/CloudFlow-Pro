-- =========================================================
-- CloudFlow Pro - HR 入职申请性别字段修复脚本
-- 目的：补齐 hr_onboarding_application.gender，避免确认入职时创建员工失败
-- 日期：2026-03-22
-- =========================================================

SET NAMES utf8mb4;

SET @gender_column_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'hr_onboarding_application'
      AND COLUMN_NAME = 'gender'
);

SET @ddl := IF(
    @gender_column_exists = 0,
    'ALTER TABLE hr_onboarding_application ADD COLUMN gender VARCHAR(20) DEFAULT NULL COMMENT ''性别：MALE-男 FEMALE-女'' AFTER name',
    'SELECT ''hr_onboarding_application.gender already exists'' AS message'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE hr_onboarding_application oa
LEFT JOIN hr_candidate c ON c.id = oa.candidate_id
SET oa.gender = c.gender
WHERE oa.gender IS NULL
  AND c.gender IS NOT NULL;

UPDATE hr_onboarding_application
SET gender = NULL
WHERE gender = '';

SELECT id, application_no, candidate_id, name, gender, status
FROM hr_onboarding_application
ORDER BY id;
