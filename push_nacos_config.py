#!/usr/bin/env python3
"""
批量推送 config 目录下的 YAML 配置到 Nacos。

默认推送:
- cloudflow-common.yaml
- cloudflow-gateway.yaml
- cloudflow-auth.yaml
- cloudflow-service-workflow.yaml
- cloudflow-service-crm.yaml
- cloudflow-service-hr.yaml
- cloudflow-service-oa.yaml
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests


ROOT_DIR = Path(__file__).resolve().parent
CONFIG_DIR = ROOT_DIR / "config"
DEFAULT_CONFIG_FILES = [
    "cloudflow-common.yaml",
    "cloudflow-gateway.yaml",
    "cloudflow-auth.yaml",
    "cloudflow-service-workflow.yaml",
    "cloudflow-service-crm.yaml",
    "cloudflow-service-hr.yaml",
    "cloudflow-service-oa.yaml",
]


def get_env(name: str, fallback: str | None = None) -> str | None:
    import os

    value = os.getenv(name)
    if value:
        return value
    return fallback


def resolve_server() -> str:
    server = get_env("NACOS_SERVER", get_env("NACOS_ADDR", "http://192.168.1.173:8848"))
    assert server is not None
    if not server.startswith(("http://", "https://")):
        server = f"http://{server}"
    return server.rstrip("/")


def resolve_config_files(files_arg: list[str] | None) -> list[str]:
    if files_arg:
        return files_arg
    return DEFAULT_CONFIG_FILES


def get_access_token(server: str, username: str, password: str) -> str:
    response = requests.post(
        f"{server}/nacos/v1/auth/login",
        data={"username": username, "password": password},
        timeout=10,
    )
    response.raise_for_status()
    token = response.json().get("accessToken")
    if not token:
        raise RuntimeError(f"获取 accessToken 失败: {response.text}")
    return token


def push_config(
    server: str,
    namespace: str,
    group: str,
    data_id: str,
    content: str,
    access_token: str,
) -> bool:
    payload = {
        "dataId": data_id,
        "group": group,
        "content": content,
        "tenant": namespace,
        "type": "yaml",
        "accessToken": access_token,
    }
    response = requests.post(f"{server}/nacos/v1/cs/configs", data=payload, timeout=15)
    return response.status_code == 200 and response.text.strip().lower() == "true"


def verify_config(
    server: str,
    namespace: str,
    group: str,
    data_id: str,
    access_token: str,
) -> tuple[int, int]:
    response = requests.get(
        f"{server}/nacos/v1/cs/configs",
        params={
            "tenant": namespace,
            "group": group,
            "dataId": data_id,
            "accessToken": access_token,
        },
        timeout=15,
    )
    return response.status_code, len(response.text)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="推送 CloudFlow 配置到 Nacos")
    parser.add_argument(
        "--files",
        nargs="*",
        help="指定要推送的 dataId 文件名，默认推送 6 个标准配置",
    )
    parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="跳过推送后的回读校验",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    server = resolve_server()
    namespace = get_env("NACOS_NAMESPACE", "0ccb9313-39d8-4a58-9fa5-ce834b77e60d")
    group = get_env("NACOS_GROUP", "DEFAULT_GROUP")
    username = get_env("NACOS_USERNAME", "nacos")
    password = get_env("NACOS_PASSWORD", "nacos")
    config_files = resolve_config_files(args.files)

    if namespace is None or group is None or username is None or password is None:
        print("缺少 Nacos 必填参数")
        return 1

    if not CONFIG_DIR.exists():
        print(f"config 目录不存在: {CONFIG_DIR}")
        return 1

    print(f"Nacos: {server}")
    print(f"命名空间: {namespace}")
    print(f"分组: {group}")
    print(f"配置目录: {CONFIG_DIR}")
    print("")

    try:
        token = get_access_token(server, username, password)
        print("获取 accessToken 成功")
    except Exception as exc:
        print(f"获取 accessToken 失败: {exc}")
        return 1

    success_count = 0
    fail_count = 0

    for config_file in config_files:
        file_path = CONFIG_DIR / config_file
        if not file_path.exists():
            print(f"文件不存在: {config_file}")
            fail_count += 1
            continue

        content = file_path.read_text(encoding="utf-8")
        print(f"推送 {config_file} ... ", end="")
        try:
            pushed = push_config(server, namespace, group, config_file, content, token)
            if not pushed:
                print("失败")
                fail_count += 1
                continue

            if args.skip_verify:
                print("成功")
                success_count += 1
                continue

            status_code, content_length = verify_config(server, namespace, group, config_file, token)
            if status_code == 200:
                print(f"成功，回读 {content_length} 字符")
                success_count += 1
            else:
                print(f"失败，回读状态 {status_code}")
                fail_count += 1
        except Exception as exc:
            print(f"失败: {exc}")
            fail_count += 1

    print("")
    print(f"完成: 成功 {success_count}，失败 {fail_count}")
    return 1 if fail_count > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
