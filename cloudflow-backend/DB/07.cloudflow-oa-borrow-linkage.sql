-- 用印/证照借还联动增量脚本
-- 作用：给印章台账补充当前借出预计归还时间，并按未归还申请回填历史借出状态。

SET @schema_name = DATABASE();

SET @add_column_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE oa_seal ADD COLUMN borrow_due_time DATETIME DEFAULT NULL COMMENT ''当前借出预计归还时间'' AFTER status',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'oa_seal'
    AND COLUMN_NAME = 'borrow_due_time'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

UPDATE oa_seal seal
JOIN (
  SELECT application.seal_id, application.expected_return_time
  FROM oa_seal_application application
  JOIN (
    SELECT seal_id, MAX(id) AS latest_id
    FROM oa_seal_application
    WHERE del_flag = '0'
      AND status IN ('BORROWED', 'OVERDUE')
    GROUP BY seal_id
  ) latest ON latest.latest_id = application.id
) active_application ON active_application.seal_id = seal.seal_id
SET seal.status = 'BORROWED',
    seal.borrow_due_time = active_application.expected_return_time
WHERE seal.del_flag = '0'
  AND seal.status <> 'DISABLED';

UPDATE oa_seal seal
LEFT JOIN oa_seal_application application
  ON application.seal_id = seal.seal_id
  AND application.del_flag = '0'
  AND application.status IN ('BORROWED', 'OVERDUE')
SET seal.borrow_due_time = NULL
WHERE seal.del_flag = '0'
  AND application.id IS NULL
  AND seal.borrow_due_time IS NOT NULL;
