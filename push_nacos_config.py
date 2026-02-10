#!/usr/bin/env python3
"""
将 config 文件夹的配置推送到 Nacos 配置中心
"""
import requests
from pathlib import Path

# Nacos 配置
NACOS_SERVER = "http://192.168.1.173:8848"
NAMESPACE = "886292cd-bfe3-4651-a67a-7604d2f4f3b9"
GROUP = "DEFAULT_GROUP"
USERNAME = "nacos"
PASSWORD = "nacos"

# 配置文件列表
CONFIG_FILES = [
    "cloudflow-common.yaml",
    "cloudflow-gateway.yaml",
    "cloudflow-auth.yaml",
    "cloudflow-service-workflow.yaml",
    "cloudflow-oa.yaml"
]

def get_access_token():
    """获取 Nacos accessToken"""
    url = f"{NACOS_SERVER}/nacos/v1/auth/login"
    data = {
        "username": USERNAME,
        "password": PASSWORD
    }
    try:
        response = requests.post(url, data=data, timeout=10)
        if response.status_code == 200:
            result = response.json()
            token = result.get("accessToken")
            if token:
                print(f"✅ 获取 accessToken 成功")
                return token
        print(f"❌ 获取 accessToken 失败: {response.text}")
        return None
    except Exception as e:
        print(f"❌ 获取 accessToken 失败: {str(e)}")
        return None

def push_config(data_id, content, access_token):
    """推送配置到 Nacos"""
    url = f"{NACOS_SERVER}/nacos/v1/cs/configs"
    
    data = {
        "dataId": data_id,
        "group": GROUP,
        "content": content,
        "tenant": NAMESPACE,
        "type": "yaml",
        "accessToken": access_token
    }
    
    try:
        response = requests.post(url, data=data, timeout=10)
        if response.status_code == 200 and response.text == "true":
            print(f"✅ 成功推送: {data_id}")
            return True
        else:
            print(f"❌ 推送失败: {data_id}, 响应: {response.text}")
            return False
    except Exception as e:
        print(f"❌ 推送失败: {data_id}, 错误: {str(e)}")
        return False

def main():
    """主函数"""
    config_dir = Path("config")
    
    if not config_dir.exists():
        print("❌ config 文件夹不存在")
        return
    
    print(f"开始推送配置到 Nacos: {NACOS_SERVER}")
    print(f"命名空间: {NAMESPACE}")
    print(f"分组: {GROUP}\n")
    
    # 先获取 accessToken
    access_token = get_access_token()
    if not access_token:
        print("无法获取 accessToken，退出")
        return
    
    print()
    success_count = 0
    fail_count = 0
    
    for config_file in CONFIG_FILES:
        file_path = config_dir / config_file
        
        if not file_path.exists():
            print(f"⚠️  文件不存在: {config_file}")
            fail_count += 1
            continue
        
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 推送到 Nacos
        if push_config(config_file, content, access_token):
            success_count += 1
        else:
            fail_count += 1
    
    print(f"\n推送完成: 成功 {success_count}, 失败 {fail_count}")

if __name__ == "__main__":
    main()
