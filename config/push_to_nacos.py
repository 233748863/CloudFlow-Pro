#!/usr/bin/env python3
"""
将 config 目录下的 yaml 配置文件批量推送到 Nacos 配置中心
用法: python push_to_nacos.py
"""

import os
import sys
import urllib.request
import urllib.parse

NACOS_ADDR = "192.168.1.173:8848"
NAMESPACE = "886292cd-bfe3-4651-a67a-7604d2f4f3b9"
GROUP = "DEFAULT_GROUP"

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))

# 要推送的配置文件列表 (文件名即 dataId)
CONFIG_FILES = [
    "cloudflow-common.yaml",
    "cloudflow-gateway.yaml",
    "cloudflow-auth.yaml",
    "cloudflow-service-workflow.yaml",
    "cloudflow-oa.yaml",
]


def publish_config(data_id: str, content: str) -> bool:
    url = f"http://{NACOS_ADDR}/nacos/v1/cs/configs"
    params = urllib.parse.urlencode({
        "tenant": NAMESPACE,
        "dataId": data_id,
        "group": GROUP,
        "content": content,
        "type": "yaml",
    }).encode("utf-8")

    req = urllib.request.Request(url, data=params, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = resp.read().decode("utf-8")
            return result.strip().lower() == "true"
    except Exception as e:
        print(f"  ✗ 推送失败: {e}")
        return False


def main():
    print(f"Nacos: {NACOS_ADDR}  Namespace: {NAMESPACE}\n")
    success, fail = 0, 0

    for filename in CONFIG_FILES:
        filepath = os.path.join(CONFIG_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  ⚠ 跳过 {filename} (文件不存在)")
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        print(f"  推送 {filename} ...", end=" ")
        if publish_config(filename, content):
            print("✓")
            success += 1
        else:
            print("✗")
            fail += 1

    print(f"\n完成: {success} 成功, {fail} 失败")
    sys.exit(1 if fail > 0 else 0)


if __name__ == "__main__":
    main()
