from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import pymysql

ROOT = Path(__file__).resolve().parents[1]
BACKUP_DIR = ROOT / '.codex-temp' / 'workflow-repair-backups'

ATTENDANCE_ROOT_DEF_ID = 'wf_attendance_appeal'
ATTENDANCE_BAD_PUBLISHED_DEF_ID = 'wf_attendance_appeal_v4'
VEHICLE_DEF_ID = 'wf_vehicle_approval'
AFFECTED_PROCESS_KEYS = ('attendance_appeal', 'vehicle_approval')

SEED_MODELS = {
    'attendance_appeal': {
        'definition_id': ATTENDANCE_ROOT_DEF_ID,
        'process_name': '\u8865\u5361/\u5916\u52e4\u5ba1\u6279\u6d41\u7a0b',
        'model_json': json.dumps(
            {
                'nodes': [
                    {'id': 'root', 'type': 'START', 'title': '\u63d0\u4ea4\u7533\u8bf7'},
                    {'id': 'n1', 'type': 'APPROVAL', 'title': '\u76f4\u5c5e\u4e0a\u7ea7\u5ba1\u6279', 'approverType': 'DIRECT_LEADER'},
                    {'id': 'end', 'type': 'END', 'title': '\u6d41\u7a0b\u7ed3\u675f'},
                ],
                'edges': [
                    {'id': 'root->n1', 'source': 'root', 'target': 'n1'},
                    {'id': 'n1->end', 'source': 'n1', 'target': 'end'},
                ],
            },
            ensure_ascii=False,
            separators=(',', ':'),
        ),
    },
    'vehicle_approval': {
        'definition_id': VEHICLE_DEF_ID,
        'process_name': '\u7528\u8f66\u5ba1\u6279\u6d41\u7a0b',
        'model_json': json.dumps(
            {
                'nodes': [
                    {'id': 'root', 'type': 'START', 'title': '\u63d0\u4ea4\u7528\u8f66\u7533\u8bf7'},
                    {'id': 'n1', 'type': 'APPROVAL', 'title': '\u76f4\u5c5e\u4e0a\u7ea7\u5ba1\u6279', 'approverType': 'DIRECT_LEADER'},
                    {'id': 'n2', 'type': 'APPROVAL', 'title': '\u884c\u653f\u786e\u8ba4\u6d3e\u8f66', 'approverType': 'ROLE', 'approverValue': 'admin'},
                    {'id': 'end', 'type': 'END', 'title': '\u6d41\u7a0b\u7ed3\u675f'},
                ],
                'edges': [
                    {'id': 'root->n1', 'source': 'root', 'target': 'n1'},
                    {'id': 'n1->n2', 'source': 'n1', 'target': 'n2'},
                    {'id': 'n2->end', 'source': 'n2', 'target': 'end'},
                ],
            },
            ensure_ascii=False,
            separators=(',', ':'),
        ),
    },
}


def unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


class WorkflowRepair:
    def __init__(self, dry_run: bool = False) -> None:
        self.dry_run = dry_run
        self.connection = pymysql.connect(
            host=os.getenv('CF_DB_HOST', '127.0.0.1'),
            port=int(os.getenv('CF_DB_PORT', '3306')),
            user=os.getenv('CF_DB_USER', 'root'),
            password=os.getenv('CF_DB_PASSWORD', ''),
            database=os.getenv('CF_DB_NAME', 'cloud_flow_db'),
            charset='utf8mb4',
            autocommit=False,
            cursorclass=pymysql.cursors.DictCursor,
        )

    def close(self) -> None:
        self.connection.close()

    def fetch_all(self, sql: str, params: Iterable[Any] | None = None) -> list[dict[str, Any]]:
        with self.connection.cursor() as cursor:
            cursor.execute(sql, tuple(params or []))
            return list(cursor.fetchall())

    def execute(self, sql: str, params: Iterable[Any] | None = None) -> int:
        with self.connection.cursor() as cursor:
            cursor.execute(sql, tuple(params or []))
            return cursor.rowcount

    def select_in(self, table: str, column: str, values: list[str]) -> list[dict[str, Any]]:
        if not values:
            return []
        placeholders = ','.join(['%s'] * len(values))
        sql = f'SELECT * FROM {table} WHERE {column} IN ({placeholders})'
        return self.fetch_all(sql, values)

    def delete_in(self, table: str, column: str, values: list[str]) -> int:
        if not values:
            return 0
        placeholders = ','.join(['%s'] * len(values))
        sql = f'DELETE FROM {table} WHERE {column} IN ({placeholders})'
        return self.execute(sql, values)

    def delete_where(self, table: str, where_sql: str, params: Iterable[Any] | None = None) -> int:
        sql = f'DELETE FROM {table} WHERE {where_sql}'
        return self.execute(sql, params)

    def build_context(self) -> dict[str, Any]:
        definitions = self.fetch_all(
            '''
            SELECT *
            FROM wf_process_definition
            WHERE process_key IN (%s, %s)
            ORDER BY process_key, version
            ''',
            AFFECTED_PROCESS_KEYS,
        )
        attendance_bad_definition_ids = [
            row['definition_id']
            for row in definitions
            if row['process_key'] == 'attendance_appeal' and row['definition_id'] != ATTENDANCE_ROOT_DEF_ID
        ]

        instances = self.fetch_all(
            '''
            SELECT *
            FROM wf_process_instance
            WHERE (process_def_key = %s AND definition_id = %s)
               OR process_def_key = %s
            ORDER BY create_time DESC
            ''',
            ('attendance_appeal', ATTENDANCE_BAD_PUBLISHED_DEF_ID, 'vehicle_approval'),
        )
        instance_ids = unique(row['instance_id'] for row in instances)

        task_rows = self.select_in('wf_task', 'instance_id', instance_ids)
        task_history_rows = self.select_in('wf_task_history', 'instance_id', instance_ids)
        task_ids = unique([row['task_id'] for row in task_rows] + [row['task_id'] for row in task_history_rows])

        countersign_rows = self.select_in('wf_countersign_task', 'instance_id', instance_ids)
        countersign_ids = unique(row['countersign_id'] for row in countersign_rows if row.get('countersign_id'))

        bad_named_stats = self.fetch_all(
            '''
            SELECT *
            FROM wf_performance_stats
            WHERE process_def_key IN (%s, %s)
              AND process_def_name LIKE '%%?%%'
            ORDER BY stat_date DESC, id DESC
            ''',
            AFFECTED_PROCESS_KEYS,
        )

        return {
            'definitions': definitions,
            'attendance_bad_definition_ids': attendance_bad_definition_ids,
            'instances': instances,
            'instance_ids': instance_ids,
            'task_rows': task_rows,
            'task_history_rows': task_history_rows,
            'task_ids': task_ids,
            'countersign_rows': countersign_rows,
            'countersign_ids': countersign_ids,
            'bad_named_stats': bad_named_stats,
        }

    def build_backup(self, context: dict[str, Any]) -> dict[str, Any]:
        instance_ids = context['instance_ids']
        task_ids = context['task_ids']
        countersign_ids = context['countersign_ids']
        attendance_bad_definition_ids = context['attendance_bad_definition_ids']

        related_tables = {
            'wf_task_read': self.select_in('wf_task_read', 'task_id', task_ids),
            'wf_task_urge': self.select_in('wf_task_urge', 'task_id', task_ids),
            'wf_urge_effect': self.select_in('wf_urge_effect', 'task_id', task_ids),
            'wf_task_candidate': self.select_in('wf_task_candidate', 'task_id', task_ids),
            'wf_task_attachment': self.select_in('wf_task_attachment', 'instance_id', instance_ids),
            'wf_task_delegation': self.select_in('wf_task_delegation', 'instance_id', instance_ids),
            'wf_task_add_sign': self.select_in('wf_task_add_sign', 'instance_id', instance_ids),
            'wf_task_monitor': self.select_in('wf_task_monitor', 'instance_id', instance_ids),
            'wf_process_snapshot': self.select_in('wf_process_snapshot', 'instance_id', instance_ids),
            'wf_node_record': self.select_in('wf_node_record', 'instance_id', instance_ids),
            'wf_node_monitor': self.select_in('wf_node_monitor', 'instance_id', instance_ids),
            'wf_process_monitor': self.select_in('wf_process_monitor', 'instance_id', instance_ids),
            'wf_process_copy': self.select_in('wf_process_copy', 'instance_id', instance_ids),
            'wf_anomaly_alert': self.select_in('wf_anomaly_alert', 'instance_id', instance_ids),
            'wf_countersign_vote_by_task': self.select_in('wf_countersign_vote', 'task_id', task_ids),
            'wf_countersign_vote_by_countersign': self.select_in('wf_countersign_vote', 'countersign_id', countersign_ids),
            'wf_process_version_snapshot': self.select_in('wf_process_version_snapshot', 'process_def_id', attendance_bad_definition_ids),
            'wf_deploy_record': self.select_in('wf_deploy_record', 'process_def_id', attendance_bad_definition_ids),
            'wf_deploy_approval': self.select_in('wf_deploy_approval', 'process_def_id', attendance_bad_definition_ids),
            'wf_deploy_rollback_history': self.select_in('wf_deploy_rollback_history', 'process_def_id', attendance_bad_definition_ids),
        }

        return {
            'createdAt': datetime.now().isoformat(timespec='seconds'),
            'dryRun': self.dry_run,
            'seedModels': SEED_MODELS,
            'context': {
                'attendance_bad_definition_ids': attendance_bad_definition_ids,
                'instance_ids': instance_ids,
                'task_ids': task_ids,
                'countersign_ids': countersign_ids,
            },
            'data': {
                'wf_process_definition': context['definitions'],
                'wf_process_instance': context['instances'],
                'wf_task': context['task_rows'],
                'wf_task_history': context['task_history_rows'],
                'wf_countersign_task': context['countersign_rows'],
                'wf_performance_stats': context['bad_named_stats'],
                **related_tables,
            },
        }

    def write_backup(self, payload: dict[str, Any]) -> Path:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = BACKUP_DIR / f'workflow_data_repair_{stamp}.json'
        backup_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
        return backup_path

    def restore_seed_definitions(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        counts['wf_attendance_appeal'] = self.execute(
            '''
            UPDATE wf_process_definition
            SET process_name = %s,
                model_json = %s,
                status = 'PUBLISHED',
                is_latest = 1,
                update_by = 'codex',
                update_time = NOW()
            WHERE definition_id = %s
            ''',
            (
                SEED_MODELS['attendance_appeal']['process_name'],
                SEED_MODELS['attendance_appeal']['model_json'],
                ATTENDANCE_ROOT_DEF_ID,
            ),
        )
        counts['wf_vehicle_approval'] = self.execute(
            '''
            UPDATE wf_process_definition
            SET process_name = %s,
                model_json = %s,
                status = 'PUBLISHED',
                is_latest = 1,
                update_by = 'codex',
                update_time = NOW()
            WHERE definition_id = %s
            ''',
            (
                SEED_MODELS['vehicle_approval']['process_name'],
                SEED_MODELS['vehicle_approval']['model_json'],
                VEHICLE_DEF_ID,
            ),
        )
        return counts

    def clean_instances(self, context: dict[str, Any]) -> dict[str, int]:
        instance_ids = context['instance_ids']
        task_ids = context['task_ids']
        countersign_ids = context['countersign_ids']
        counts: dict[str, int] = {}

        counts['wf_task_read'] = self.delete_in('wf_task_read', 'task_id', task_ids)
        counts['wf_task_urge'] = self.delete_in('wf_task_urge', 'task_id', task_ids)
        counts['wf_urge_effect'] = self.delete_in('wf_urge_effect', 'task_id', task_ids)
        counts['wf_task_candidate'] = self.delete_in('wf_task_candidate', 'task_id', task_ids)
        counts['wf_countersign_vote_by_task'] = self.delete_in('wf_countersign_vote', 'task_id', task_ids)
        counts['wf_countersign_vote_by_countersign'] = self.delete_in('wf_countersign_vote', 'countersign_id', countersign_ids)
        counts['wf_countersign_task'] = self.delete_in('wf_countersign_task', 'instance_id', instance_ids)
        counts['wf_task_attachment'] = self.delete_where(
            'wf_task_attachment',
            self._build_or_clause(['instance_id', 'task_id'], instance_ids, task_ids),
            tuple(instance_ids + task_ids),
        )
        counts['wf_task_delegation'] = self.delete_where(
            'wf_task_delegation',
            self._build_or_clause(['instance_id', 'task_id'], instance_ids, task_ids),
            tuple(instance_ids + task_ids),
        )
        counts['wf_task_add_sign'] = self.delete_where(
            'wf_task_add_sign',
            self._build_or_clause(['instance_id', 'task_id'], instance_ids, task_ids),
            tuple(instance_ids + task_ids),
        )
        counts['wf_task_monitor'] = self.delete_where(
            'wf_task_monitor',
            self._build_or_clause(['instance_id', 'task_id'], instance_ids, task_ids),
            tuple(instance_ids + task_ids),
        )
        counts['wf_process_snapshot'] = self.delete_in('wf_process_snapshot', 'instance_id', instance_ids)
        counts['wf_node_record'] = self.delete_in('wf_node_record', 'instance_id', instance_ids)
        counts['wf_node_monitor'] = self.delete_in('wf_node_monitor', 'instance_id', instance_ids)
        counts['wf_process_copy'] = self.delete_in('wf_process_copy', 'instance_id', instance_ids)
        counts['wf_anomaly_alert'] = self.delete_where(
            'wf_anomaly_alert',
            self._build_or_clause(['instance_id', 'task_id'], instance_ids, task_ids),
            tuple(instance_ids + task_ids),
        )
        counts['wf_task_history'] = self.delete_in('wf_task_history', 'instance_id', instance_ids)
        counts['wf_task'] = self.delete_in('wf_task', 'instance_id', instance_ids)
        counts['wf_process_monitor'] = self.delete_in('wf_process_monitor', 'instance_id', instance_ids)
        counts['wf_process_instance'] = self.delete_in('wf_process_instance', 'instance_id', instance_ids)
        counts['wf_performance_stats'] = self.delete_where(
            'wf_performance_stats',
            "process_def_key IN (%s, %s) AND process_def_name LIKE '%%?%%'",
            AFFECTED_PROCESS_KEYS,
        )
        return counts

    def clean_bad_definitions(self, context: dict[str, Any]) -> dict[str, int]:
        bad_definition_ids = context['attendance_bad_definition_ids']
        counts: dict[str, int] = {}
        counts['wf_process_version_snapshot'] = self.delete_in('wf_process_version_snapshot', 'process_def_id', bad_definition_ids)
        counts['wf_deploy_rollback_history'] = self.delete_in('wf_deploy_rollback_history', 'process_def_id', bad_definition_ids)
        counts['wf_deploy_approval'] = self.delete_in('wf_deploy_approval', 'process_def_id', bad_definition_ids)
        counts['wf_deploy_record'] = self.delete_in('wf_deploy_record', 'process_def_id', bad_definition_ids)
        counts['wf_process_definition'] = self.delete_in('wf_process_definition', 'definition_id', bad_definition_ids)
        return counts

    @staticmethod
    def _build_or_clause(columns: list[str], first_values: list[str], second_values: list[str]) -> str:
        first_placeholders = ','.join(['%s'] * len(first_values)) if first_values else ''
        second_placeholders = ','.join(['%s'] * len(second_values)) if second_values else ''
        clauses: list[str] = []
        if first_values:
            clauses.append(f'{columns[0]} IN ({first_placeholders})')
        if second_values:
            clauses.append(f'{columns[1]} IN ({second_placeholders})')
        if not clauses:
            return '1 = 0'
        return ' OR '.join(clauses)

    def verify(self) -> dict[str, Any]:
        return {
            'definitions': self.fetch_all(
                '''
                SELECT definition_id, process_name, process_key, version, status, is_latest
                FROM wf_process_definition
                WHERE process_key IN (%s, %s)
                ORDER BY process_key, version
                ''',
                AFFECTED_PROCESS_KEYS,
            ),
            'remaining_bad_instances': self.fetch_all(
                '''
                SELECT instance_id, process_def_key, definition_id, title, status
                FROM wf_process_instance
                WHERE (process_def_key = %s AND definition_id = %s)
                   OR process_def_key = %s
                ORDER BY process_def_key, create_time DESC
                ''',
                ('attendance_appeal', ATTENDANCE_BAD_PUBLISHED_DEF_ID, 'vehicle_approval'),
            ),
            'remaining_bad_tasks': self.fetch_all(
                '''
                SELECT task_id, instance_id, node_name, status
                FROM wf_task
                WHERE node_name LIKE '%%?%%'
                ORDER BY create_time DESC
                ''',
            ),
            'remaining_bad_stats': self.fetch_all(
                '''
                SELECT id, stat_date, process_def_key, process_def_name
                FROM wf_performance_stats
                WHERE process_def_key IN (%s, %s)
                  AND process_def_name LIKE '%%?%%'
                ORDER BY stat_date DESC, id DESC
                ''',
                AFFECTED_PROCESS_KEYS,
            ),
        }

    def run(self) -> dict[str, Any]:
        context = self.build_context()
        backup_payload = self.build_backup(context)
        backup_path = self.write_backup(backup_payload)
        summary = {
            'backupPath': str(backup_path),
            'dryRun': self.dry_run,
            'before': {
                'definitions': len(context['definitions']),
                'attendanceBadDefinitions': len(context['attendance_bad_definition_ids']),
                'instances': len(context['instance_ids']),
                'tasks': len(context['task_ids']),
                'countersigns': len(context['countersign_ids']),
                'badStats': len(context['bad_named_stats']),
            },
        }
        if self.dry_run:
            self.connection.rollback()
            summary['after'] = self.verify()
            return summary

        try:
            restore_counts = self.restore_seed_definitions()
            instance_cleanup_counts = self.clean_instances(context)
            definition_cleanup_counts = self.clean_bad_definitions(context)
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

        summary['updated'] = restore_counts
        summary['deleted'] = {
            **instance_cleanup_counts,
            **definition_cleanup_counts,
        }
        summary['after'] = self.verify()
        return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='\u6062\u590d workflow \u79cd\u5b50\u5b9a\u4e49\u5e76\u6e05\u7406\u4e71\u7801\u5b9e\u4f8b\u6570\u636e')
    parser.add_argument('--dry-run', action='store_true', help='\u53ea\u5907\u4efd\u548c\u9884\u89c8\uff0c\u4e0d\u63d0\u4ea4\u6570\u636e\u5e93\u4fee\u6539')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repair = WorkflowRepair(dry_run=args.dry_run)
    try:
        summary = repair.run()
    finally:
        repair.close()
    print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))


if __name__ == '__main__':
    main()
