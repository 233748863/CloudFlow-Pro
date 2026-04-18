#!/usr/bin/env python3
"""
将 config 目录下的 YAML 配置文件批量推送到 Nacos 配置中心。
"""

import os
from pathlib import Path

import requests


NACOS_SERVER = os.getenv("NACOS_SERVER", "http://192.168.1.173:8848")
NAMESPACE = os.getenv("NACOS_NAMESPACE", "0ccb9313-39d8-4a58-9fa5-ce834b77e60d")
GROUP = os.getenv("NACOS_GROUP", "DEFAULT_GROUP")
USERNAME = os.getenv("NACOS_USERNAME", "nacos")
PASSWORD = os.getenv("NACOS_PASSWORD", "nacos")

CONFIG_DIR = Path(__file__).resolve().parent / "config"
CONFIG_FILES = [
    "cloudflow-common.yaml",
    "cloudflow-gateway.yaml",
    "cloudflow-auth.yaml",
    "cloudflow-service-workflow.yaml",
    "cloudflow-service-hr.yaml",
    "cloudflow-oa.yaml",
]


def get_access_token() -> str | None:
    """登录 Nacos 并返回 accessToken。"""
    url = f"{NACOS_SERVER}/nacos/v1/auth/login"
    try:
        response = requests.post(
            url,
            data={"username": USERNAME, "password": PASSWORD},
            timeout=10,
        )
        response.raise_for_status()
        token = response.json().get("accessToken")
        if token:
            print("获取 accessToken 成功")
            return token
        print(f"获取 accessToken 失败: {response.text}")
        return None
    except Exception as exc:
        print(f"获取 accessToken 失败: {exc}")
        return None


def push_config(data_id: str, content: str, access_token: str) -> bool:
    """推送单个配置到 Nacos。"""
    url = f"{NACOS_SERVER}/nacos/v1/cs/configs"
    payload = {
        "dataId": data_id,
        "group": GROUP,
        "content": content,
        "tenant": NAMESPACE,
        "type": "yaml",
        "accessToken": access_token,
    }
    try:
        response = requests.post(url, data=payload, timeout=10)
        if response.status_code == 200 and response.text.strip().lower() == "true":
            print(f"成功推送: {data_id}")
            return True
        print(f"推送失败: {data_id}, 响应: {response.text}")
        return False
    except Exception as exc:
        print(f"推送失败: {data_id}, 错误: {exc}")
        return False


def main() -> None:
    """脚本入口。"""
    if not CONFIG_DIR.exists():
        print("config 文件夹不存在")
        return

    print(f"开始推送配置到 Nacos: {NACOS_SERVER}")
    print(f"命名空间: {NAMESPACE}")
    print(f"分组: {GROUP}\n")

    access_token = get_access_token()
    if not access_token:
        print("无法获取 accessToken，退出")
        return

    success_count = 0
    fail_count = 0

    for config_file in CONFIG_FILES:
        file_path = CONFIG_DIR / config_file
        if not file_path.exists():
            print(f"文件不存在: {config_file}")
            fail_count += 1
            continue

        with open(file_path, "r", encoding="utf-8") as file:
            content = file.read()

        if push_config(config_file, content, access_token):
            success_count += 1
        else:
            fail_count += 1

    print(f"\n推送完成: 成功 {success_count}, 失败 {fail_count}")


if __name__ == "__main__":
    main()
