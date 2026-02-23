#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一SQL文件编码为UTF-8
修复编码问题导致的中文乱码
"""

import os
import chardet

def detect_and_convert_encoding(filepath):
    """检测文件编码并转换为UTF-8"""
    try:
        # 读取文件的原始字节
        with open(filepath, 'rb') as f:
            raw_data = f.read()
        
        # 检测编码
        detected = chardet.detect(raw_data)
        detected_encoding = detected['encoding']
        confidence = detected['confidence']
        
        print(f"\n文件: {os.path.basename(filepath)}")
        print(f"  检测到的编码: {detected_encoding} (置信度: {confidence:.2%})")
        
        # 如果已经是UTF-8，跳过
        if detected_encoding and detected_encoding.lower().startswith('utf-8'):
            print(f"  ✓ 已经是UTF-8编码，无需转换")
            return True
        
        # 尝试用检测到的编码解码
        try:
            content = raw_data.decode(detected_encoding)
        except:
            # 如果检测的编码失败，尝试常见编码
            for enc in ['gbk', 'gb2312', 'gb18030', 'latin-1']:
                try:
                    content = raw_data.decode(enc)
                    detected_encoding = enc
                    print(f"  使用 {enc} 编码成功解码")
                    break
                except:
                    continue
            else:
                print(f"  ✗ 无法解码文件")
                return False
        
        # 写回UTF-8编码
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"  ✓ 已转换为UTF-8编码 (原编码: {detected_encoding})")
        return True
        
    except Exception as e:
        print(f"  ✗ 处理失败: {str(e)}")
        return False

def main():
    """主函数"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    sql_files = [
        '01.cloudflow-common.sql',
        '02.cloudflow-workflow.sql',
        '04.cloudflow-oa.sql'
    ]
    
    print("=" * 70)
    print("开始统一SQL文件编码为UTF-8")
    print("=" * 70)
    
    success_count = 0
    for filename in sql_files:
        filepath = os.path.join(script_dir, filename)
        if os.path.exists(filepath):
            if detect_and_convert_encoding(filepath):
                success_count += 1
        else:
            print(f"\n文件: {filename}")
            print(f"  ✗ 文件不存在")
    
    print("\n" + "=" * 70)
    print(f"处理完成！成功转换 {success_count}/{len(sql_files)} 个文件")
    print("=" * 70)

if __name__ == '__main__':
    main()
