#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复SQL文件中的sysdate()函数为NOW()
适用于Windows环境，避免PowerShell编码问题
"""

import os
import re

def fix_sql_file(filepath):
    """修复单个SQL文件"""
    # 尝试多种编码
    encodings = ['utf-8', 'gbk', 'gb2312', 'latin-1']
    
    for encoding in encodings:
        try:
            # 尝试使用当前编码读取文件
            with open(filepath, 'r', encoding=encoding) as f:
                content = f.read()
            
            # 统计替换次数
            count = content.count('sysdate()')
            
            if count == 0:
                print(f"✓ {os.path.basename(filepath)}: 无需修复 (编码: {encoding})")
                return 0
            
            # 替换 sysdate() 为 NOW()
            new_content = content.replace('sysdate()', 'NOW()')
            
            # 写回文件，使用UTF-8编码
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            print(f"✓ {os.path.basename(filepath)}: 已修复 {count} 处 (原编码: {encoding}, 新编码: utf-8)")
            return count
            
        except UnicodeDecodeError:
            # 当前编码失败，尝试下一个
            continue
        except Exception as e:
            print(f"✗ {os.path.basename(filepath)}: 修复失败 - {str(e)}")
            return 0
    
    print(f"✗ {os.path.basename(filepath)}: 无法识别文件编码")
    return 0

def main():
    """主函数"""
    # 获取当前脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # SQL文件列表
    sql_files = [
        '01.cloudflow-common.sql',
        '02.cloudflow-workflow.sql',
        '04.cloudflow-oa.sql'
    ]
    
    print("=" * 60)
    print("开始修复SQL文件中的 sysdate() 函数")
    print("=" * 60)
    
    total_count = 0
    for filename in sql_files:
        filepath = os.path.join(script_dir, filename)
        if os.path.exists(filepath):
            count = fix_sql_file(filepath)
            total_count += count
        else:
            print(f"✗ {filename}: 文件不存在")
    
    print("=" * 60)
    print(f"修复完成！共修复 {total_count} 处")
    print("=" * 60)

if __name__ == '__main__':
    main()
