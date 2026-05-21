#!/usr/bin/env python3
"""
扫描 OA / CRM Controller 中的 HTTP 端点是否带鉴权注解。

规则：
- 仅扫描 *Controller.java
- 对每个 @GetMapping / @PostMapping / @PutMapping / @DeleteMapping / @PatchMapping 方法注解，
  以及 method 上方的 @RequestMapping（class 上方的 @RequestMapping 视为类前缀，跳过），
  要求"该方法的注解块"内出现以下任一保护性注解：
    @SaCheckPermission / @SaCheckRole / @SaCheckLogin / @Inner / @SaIgnore / @Anonymous
- 类级 @SaCheckPermission / @SaCheckRole / @Inner / @SaIgnore / @Anonymous 视为已保护所有方法
- 若任何方法未被保护，输出 file:line  method-name 并以 exit 1 失败

约定：脚本作为 CI 守护，专注于"漏注解"快速发现；非完整 AST 分析。
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import List, Optional

METHOD_MAPPING_RE = re.compile(
    r"^\s*@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\b"
)
PROTECT_RE = re.compile(
    r"@(SaCheckPermission|SaCheckRole|SaCheckLogin|Inner|SaIgnore|Anonymous)\b"
)
CLASS_HEADER_RE = re.compile(r"^\s*public\s+(class|interface|abstract\s+class)\s+\w+")
METHOD_SIG_RE = re.compile(
    r"^\s*(public|protected|private|static|final|\s)+\s*[\w<>\[\],\s\?]+\s+(\w+)\s*\("
)
SIMPLE_METHOD_NAME_RE = re.compile(r"\b(\w+)\s*\(")
ANNOT_LINE_RE = re.compile(r"^\s*@")


def class_has_protection(lines: List[str], class_decl_line: int) -> bool:
    """类声明上方所有连续注解行内是否有保护性注解。"""
    i = class_decl_line - 1
    while i >= 0:
        s = lines[i].strip()
        if s == "":
            i -= 1
            continue
        if s.startswith("//") or s.startswith("*") or s.startswith("/*"):
            i -= 1
            continue
        if s.startswith("@"):
            if PROTECT_RE.search(lines[i]):
                return True
            i -= 1
            continue
        break
    return False


def find_method_sig_line(lines: List[str], mapping_line: int) -> Optional[int]:
    for i in range(mapping_line + 1, min(len(lines), mapping_line + 30)):
        s = lines[i].strip()
        if s == "" or s.startswith("@") or s.startswith("//") or s.startswith("*"):
            continue
        if "(" in s:
            return i
        return None
    return None


def method_annot_block_protected(lines: List[str], mapping_line: int, method_sig_line: int) -> bool:
    # Above mapping_line: contiguous annotation lines
    i = mapping_line - 1
    while i >= 0:
        s = lines[i].strip()
        if s == "":
            i -= 1
            continue
        if s.startswith("//") or s.startswith("*") or s.startswith("/*"):
            i -= 1
            continue
        if s.startswith("@"):
            if PROTECT_RE.search(lines[i]):
                return True
            i -= 1
            continue
        break
    # Mapping line itself + between mapping and method sig
    for j in range(mapping_line, method_sig_line + 1):
        if PROTECT_RE.search(lines[j]):
            return True
    return False


def extract_method_name(lines: List[str], sig_line: int) -> str:
    line = lines[sig_line]
    m = METHOD_SIG_RE.match(line)
    if m:
        return m.group(2)
    m2 = SIMPLE_METHOD_NAME_RE.search(line)
    if m2:
        return m2.group(1)
    return "<unknown>"


def scan_file(path: Path) -> List[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    class_decl_line: Optional[int] = None
    for idx, line in enumerate(lines):
        if CLASS_HEADER_RE.match(line):
            class_decl_line = idx
            break
    if class_decl_line is None:
        return []
    if class_has_protection(lines, class_decl_line):
        return []

    issues: List[str] = []
    for idx, line in enumerate(lines):
        if not METHOD_MAPPING_RE.match(line):
            continue
        # 类级 @RequestMapping 在 class 声明之前，跳过
        if idx < class_decl_line:
            continue
        sig_line = find_method_sig_line(lines, idx)
        if sig_line is None:
            continue
        if method_annot_block_protected(lines, idx, sig_line):
            continue
        method_name = extract_method_name(lines, sig_line)
        issues.append(f"{path}:{idx + 1}  {method_name}")
    return issues


def iter_controller_files(roots: List[str]):
    for root in roots:
        root_path = Path(root)
        if not root_path.exists():
            print(f"[WARN] 扫描根路径不存在: {root}", file=sys.stderr)
            continue
        for dirpath, _, filenames in os.walk(root_path):
            for fn in filenames:
                if fn.endswith("Controller.java"):
                    yield Path(dirpath) / fn


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        print("用法: scan-controller-auth.py <java-root1> [<java-root2> ...]", file=sys.stderr)
        return 2
    roots = argv[1:]
    bad: List[str] = []
    for f in iter_controller_files(roots):
        bad.extend(scan_file(f))
    if bad:
        for line in bad:
            print(line)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
