"""Read MySQL seed statements without splitting quoted JSON, dates or functions."""
from __future__ import annotations

import re
from collections.abc import Iterator


def code_positions(source: str) -> Iterator[tuple[int, str]]:
    """Yield SQL syntax positions outside strings and comments."""
    index = 0
    quote = None
    while index < len(source):
        char = source[index]
        if quote:
            if char == "\\":
                index += 2
                continue
            if char == quote:
                if index + 1 < len(source) and source[index + 1] == quote:
                    index += 2
                    continue
                quote = None
        elif char in "'\"`":
            quote = char
        elif source.startswith("--", index) and (index + 2 == len(source) or source[index + 2].isspace()):
            end = source.find("\n", index)
            index = len(source) if end < 0 else end
            continue
        elif char == "#":
            end = source.find("\n", index)
            index = len(source) if end < 0 else end
            continue
        elif source.startswith("/*", index):
            end = source.find("*/", index + 2)
            if end < 0:
                raise ValueError("Unclosed SQL comment")
            index = end + 2
            continue
        else:
            yield index, char
        index += 1
    if quote:
        raise ValueError("Unclosed SQL string")


def statement_spans(source: str) -> Iterator[tuple[int, int]]:
    start = 0
    for index, char in code_positions(source):
        if char == ";":
            yield start, index + 1
            start = index + 1
    if source[start:].strip():
        yield start, len(source)


def comma_parts(source: str) -> list[str]:
    parts = []
    start = 0
    depth = 0
    for index, char in code_positions(source):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                raise ValueError("Unbalanced SQL parentheses")
        elif char == "," and depth == 0:
            parts.append(source[start:index].strip())
            start = index + 1
    if depth:
        raise ValueError("Unbalanced SQL parentheses")
    parts.append(source[start:].strip())
    return parts


INSERT_VALUES = re.compile(
    r"\bINSERT\s+(?:IGNORE\s+)?INTO\s+(?:(?:`?\w+`?)\.)?`?(\w+)`?\s*"
    r"\(([^()]*)\)\s*VALUES\s*", re.IGNORECASE,
)


def value_rows(statement: str) -> tuple[re.Match[str], list[str], list[list[str]], str] | None:
    match = INSERT_VALUES.search(statement)
    if not match:
        return None
    columns = [value.strip().strip("`") for value in match[2].split(",")]
    payload = statement[match.end():].rstrip()
    suffix = ";" if payload.endswith(";") else ""
    if suffix:
        payload = payload[:-1]
    rows = []
    for value in comma_parts(payload):
        positions = code_positions(value)
        first = next(((index, char) for index, char in positions if not char.isspace()), None)
        if first and first[1] == "(":
            value = value[first[0]:]
        if not value.startswith("(") or not value.endswith(")"):
            raise ValueError("Seed VALUES has unsupported trailing syntax: " + match[1])
        row = comma_parts(value[1:-1])
        if len(row) != len(columns):
            raise ValueError(f"{match[1]} has {len(columns)} columns and {len(row)} values")
        rows.append(row)
    return match, columns, rows, suffix
