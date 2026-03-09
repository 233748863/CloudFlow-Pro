import base64
import hashlib
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


AUTH_BASE_URL = "http://127.0.0.1:9001"
GATEWAY_BASE_URL = "http://127.0.0.1:9000"
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
ROOT_DIR = PROJECT_ROOT / ".codex-temp"
LOG_DIR = ROOT_DIR / "logs"


class RegressionError(RuntimeError):
    """回归脚本中的断言失败。"""


def now_ms() -> int:
    return int(time.time() * 1000)


def unique_text(prefix: str) -> str:
    return f"{prefix}-{now_ms()}"


def format_datetime(dt) -> str:
    """统一输出后端可接收的 LocalDateTime 文本。"""
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def format_date(dt) -> str:
    return dt.strftime("%Y-%m-%d")


def json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def ensure(condition: bool, message: str):
    if not condition:
        raise RegressionError(message)


def ensure_equal(actual, expected, message: str):
    if actual != expected:
        raise RegressionError(f"{message}，期望={expected!r}，实际={actual!r}")


def normalize_page_rows(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("rows", "records", "list", "data", "items"):
            value = data.get(key)
            if isinstance(value, list):
                return value
    return []


def normalize_page_total(data):
    if isinstance(data, dict):
        for key in ("total", "count"):
            value = data.get(key)
            if isinstance(value, int):
                return value
    return len(normalize_page_rows(data))


def save_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_dumps(payload), encoding="utf-8")


class HttpClient:
    """统一处理 CloudFlow 的 R 包装和网关请求。"""

    def __init__(self, base_url: str, default_headers=None):
        self.base_url = base_url.rstrip("/")
        self.default_headers = default_headers or {}

    def request(self, method: str, path: str, data=None, params=None, headers=None):
        url = path if path.startswith("http://") or path.startswith("https://") else f"{self.base_url}{path}"
        if params:
            query = urllib.parse.urlencode(params, doseq=True)
            url = f"{url}?{query}"
        body = None if data is None else json.dumps(data).encode("utf-8")
        merged_headers = {"Content-Type": "application/json", **self.default_headers}
        if headers:
            merged_headers.update(headers)
        request = urllib.request.Request(url, data=body, headers=merged_headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            try:
                return json.loads(raw)
            except json.JSONDecodeError as inner_exc:
                raise RegressionError(f"HTTP {exc.code}，且响应不是 JSON：{raw}") from inner_exc

    def get(self, path: str, params=None, headers=None):
        return self.request("GET", path, params=params, headers=headers)

    def post(self, path: str, data=None, params=None, headers=None):
        return self.request("POST", path, data=data, params=params, headers=headers)

    def put(self, path: str, data=None, params=None, headers=None):
        return self.request("PUT", path, data=data, params=params, headers=headers)

    def delete(self, path: str, data=None, params=None, headers=None):
        return self.request("DELETE", path, data=data, params=params, headers=headers)

    def request_bytes(self, method: str, path: str, data=None, params=None, headers=None):
        url = path if path.startswith("http://") or path.startswith("https://") else f"{self.base_url}{path}"
        if params:
            query = urllib.parse.urlencode(params, doseq=True)
            url = f"{url}?{query}"
        body = None if data is None else json.dumps(data).encode("utf-8")
        merged_headers = {"Content-Type": "application/json", **self.default_headers}
        if headers:
            merged_headers.update(headers)
        request = urllib.request.Request(url, data=body, headers=merged_headers, method=method.upper())
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as inner_exc:
                raise RegressionError(f"HTTP {exc.code}，且响应不是 JSON/UTF-8") from inner_exc
            raise RegressionError(f"HTTP {exc.code}：{payload}")


class CloudFlowSession:
    """封装登录、滑块识别和带鉴权的网关访问。"""

    def __init__(self):
        self.auth_client = HttpClient(AUTH_BASE_URL)
        self.gateway_client = HttpClient(GATEWAY_BASE_URL)
        self.tokens = {}
        self.user_infos = {}

    def solve_slider_captcha(self) -> str:
        captcha = self.auth_client.get("/captcha/slider")
        ensure(captcha and captcha.get("code") == 200, f"获取滑块验证码失败：{captcha}")
        data = captcha["data"]

        bg_image = self._decode_data_url(data["bgImage"])
        slider_image = self._decode_data_url(data["sliderImage"])

        # 通过模板匹配缺口位置，避免依赖暴力猜解。
        bg_np = np.array(bg_image.convert("RGBA"))
        slider_np = np.array(slider_image.convert("RGBA"))
        alpha_mask = (slider_np[:, :, 3] > 0).astype(np.uint8) * 255
        inner_mask = cv2.erode(alpha_mask, np.ones((3, 3), np.uint8), iterations=2)
        crop = bg_np[data["y"] : data["y"] + slider_np.shape[0], :, :3]
        crop_gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
        result = cv2.matchTemplate(255 - crop_gray, inner_mask, cv2.TM_CCORR_NORMED)
        _, _, _, max_loc = cv2.minMaxLoc(result)

        candidate_x = int(max_loc[0])
        for delta in (0, -2, 2, -4, 4, -6, 6, -8, 8):
            verify = self.auth_client.post("/captcha/check", {"uuid": data["uuid"], "x": candidate_x + delta})
            if verify and verify.get("code") == 200:
                return verify["data"]["passToken"]

        raise RegressionError(f"滑块验证码识别失败：{verify}")

    def login(self, username: str, password: str = "123456"):
        pass_token = self.solve_slider_captcha()
        payload = {
            "username": username,
            "password": hashlib.sha256(password.encode("utf-8")).hexdigest(),
            "rememberMe": False,
            "captchaToken": pass_token,
        }
        response = self.auth_client.post("/login", payload)
        ensure(response and response.get("code") == 200, f"{username} 登录失败：{response}")
        token = response["data"]["token"]
        self.tokens[username] = token
        info_response = self.auth_client.get("/info", headers={"Authorization": f"Bearer {token}"})
        ensure(info_response and info_response.get("code") == 200, f"{username} 获取用户信息失败：{info_response}")
        self.user_infos[username] = info_response["data"]
        return token, info_response["data"]

    def gateway(self, username: str) -> HttpClient:
        token = self.tokens.get(username)
        ensure(token is not None, f"用户 {username} 尚未登录")
        return HttpClient(GATEWAY_BASE_URL, {"Authorization": f"Bearer {token}"})

    def _decode_data_url(self, data_url: str) -> Image.Image:
        raw = base64.b64decode(data_url.split(",", 1)[1])
        return Image.open(io.BytesIO(raw))


class StepRecorder:
    """按步骤记录回归结果，失败后继续执行。"""

    def __init__(self, suite_name: str):
        self.suite_name = suite_name
        self.results = []

    def run(self, name: str, func):
        start = time.time()
        try:
            detail = func()
            self.results.append(
                {
                    "name": name,
                    "status": "passed",
                    "detail": detail,
                    "elapsedMs": int((time.time() - start) * 1000),
                }
            )
            return detail
        except Exception as exc:  # noqa: BLE001
            self.results.append(
                {
                    "name": name,
                    "status": "failed",
                    "detail": str(exc),
                    "elapsedMs": int((time.time() - start) * 1000),
                }
            )
            return None

    def summary(self):
        total = len(self.results)
        passed = sum(1 for item in self.results if item["status"] == "passed")
        failed = total - passed
        return {
            "suite": self.suite_name,
            "total": total,
            "passed": passed,
            "failed": failed,
            "results": self.results,
        }
