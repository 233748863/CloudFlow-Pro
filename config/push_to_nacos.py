#!/usr/bin/env python3
"""
将当前目录下的 YAML 配置文件批量推送到 Nacos 配置中心。
用法: python push_to_nacos.py
"""

import os
import sys
import urllib.parse
import urllib.request


NACOS_ADDR = os.getenv("NACOS_ADDR", "192.168.1.173:8848")
NAMESPACE = os.getenv("NACOS_NAMESPACE", "0ccb9313-39d8-4a58-9fa5-ce834b77e60d")
GROUP = os.getenv("NACOS_GROUP", "DEFAULT_GROUP")

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILES = [
    "cloudflow-common.yaml",
    "cloudflow-gateway.yaml",
    "cloudflow-auth.yaml",
    "cloudflow-service-workflow.yaml",
    "cloudflow-service-hr.yaml",
    "cloudflow-oa.yaml",
]


def publish_config(data_id: str, content: str) -> bool:
    """推送单个配置。"""
    url = f"http://{NACOS_ADDR}/nacos/v1/cs/configs"
    params = urllib.parse.urlencode(
        {
            "tenant": NAMESPACE,
            "dataId": data_id,
            "group": GROUP,
            "content": content,
            "type": "yaml",
        }
    ).encode("utf-8")

    request = urllib.request.Request(url, data=params, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = response.read().decode("utf-8")
            return result.strip().lower() == "true"
    except Exception as exc:
        print(f"  推送失败: {exc}")
        return False


def main() -> None:
    """脚本入口。"""
    print(f"Nacos: {NACOS_ADDR}  Namespace: {NAMESPACE}\n")
    success = 0
    fail = 0

    for filename in CONFIG_FILES:
        filepath = os.path.join(CONFIG_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  跳过 {filename}，文件不存在")
            continue

        with open(filepath, "r", encoding="utf-8") as file:
            content = file.read()

        print(f"  推送 {filename} ...", end=" ")
        if publish_config(filename, content):
            print("成功")
            success += 1
        else:
            print("失败")
            fail += 1

    print(f"\n完成: {success} 成功, {fail} 失败")
    sys.exit(1 if fail > 0 else 0)


if __name__ == "__main__":
    main()
