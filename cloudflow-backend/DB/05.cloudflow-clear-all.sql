USE cloud_flow_db;

SET NAMES utf8mb4;

-- =========================================================
-- CloudFlow Pro - 总清库脚本
-- 用途：
-- 1. 清空 cloud_flow_db 当前所有业务表数据
-- 2. 重置含 AUTO_INCREMENT 的表自增值
-- 3. 执行后可直接执行 06.cloudflow-business-seed.sql 重刷数据
-- 4. 若需全量重建，请按 01、02、03、04、06 顺序执行
-- =========================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cloudflow_clear_all$$

CREATE PROCEDURE sp_cloudflow_clear_all()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_table_name VARCHAR(128);

    DECLARE cur_tables CURSOR FOR
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;

    DECLARE cur_auto CURSOR FOR
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND extra = 'auto_increment'
        ORDER BY table_name;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET FOREIGN_KEY_CHECKS = 1;
        RESIGNAL;
    END;

    SET FOREIGN_KEY_CHECKS = 0;

    OPEN cur_tables;

    clear_loop: LOOP
        FETCH cur_tables INTO v_table_name;
        IF done = 1 THEN
            LEAVE clear_loop;
        END IF;

        SET @clear_sql = CONCAT('DELETE FROM `', REPLACE(v_table_name, '`', '``'), '`');
        PREPARE stmt FROM @clear_sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END LOOP;

    CLOSE cur_tables;

    SET done = 0;

    OPEN cur_auto;

    reset_loop: LOOP
        FETCH cur_auto INTO v_table_name;
        IF done = 1 THEN
            LEAVE reset_loop;
        END IF;

        SET @reset_sql = CONCAT('ALTER TABLE `', REPLACE(v_table_name, '`', '``'), '` AUTO_INCREMENT = 1');
        PREPARE stmt FROM @reset_sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END LOOP;

    CLOSE cur_auto;

    SET FOREIGN_KEY_CHECKS = 1;
END$$

CALL sp_cloudflow_clear_all()$$
DROP PROCEDURE IF EXISTS sp_cloudflow_clear_all$$

DELIMITER ;
