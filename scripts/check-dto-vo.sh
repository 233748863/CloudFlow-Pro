#!/usr/bin/env bash
# scripts/check-dto-vo.sh
#
# DTO/Entity/VO 红线 diff 守门：扫描相对 base 分支（默认 origin/master）的新增违规。
# 仅检查 +号行（新增），不会因为历史代码触发；用于 CI 拦截回退。
#
# 守的四条红线（与 plan fluffy-drifting-ladybug.md 对齐）：
#   1. Controller @RequestBody Map<...>            — 入参禁 Map
#   2. Controller @RequestParam Map<...>           — 查询禁 Map
#   3. R<Map<...>> / R<List<Map<...>>>             — 出参禁 Map
#   4. R<XxxEntity> 直返 Entity（启发式：R<Hr*/Sys*/Oa*/Crm*> 且不以 VO/DTO/Payload/Request/Query 结尾）
#
# 工作流引擎 variables Map<String,Object> 豁免：本脚本只看 Controller 出参 R<>，
# Service / Workflow Engine 内部的 Map<String,Object> 不计违规。
#
# Usage: scripts/check-dto-vo.sh [base-ref]
#   base-ref 默认 origin/master，本地无 origin 时回退 master

set -euo pipefail

BASE_REF="${1:-origin/master}"
if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  BASE_REF="master"
  if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
    echo "[skip] 找不到 base ref（origin/master/master 均不存在），跳过 diff 守门" >&2
    exit 0
  fi
fi

echo "[check-dto-vo] base ref: $BASE_REF"

VIOLATIONS=0
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# 仅看 *.java 的 + 号行（不含 +++ 头）
git diff "$BASE_REF" -- '*.java' \
  | grep -E '^\+[^+]' \
  | sed 's/^+//' > "$TMP" || true

report_ere() {
  local pattern="$1"
  local label="$2"
  local hits
  hits=$(grep -cE "$pattern" "$TMP" || true)
  if [ "${hits:-0}" -gt 0 ]; then
    echo ""
    echo "❌ 新增违规 [$label]：$hits 处"
    grep -nE "$pattern" "$TMP" | head -20
    VIOLATIONS=$((VIOLATIONS + hits))
  fi
}

report_pcre() {
  local pattern="$1"
  local label="$2"
  local hits
  hits=$(grep -cP "$pattern" "$TMP" 2>/dev/null || true)
  if [ "${hits:-0}" -gt 0 ]; then
    echo ""
    echo "❌ 新增违规 [$label]：$hits 处"
    grep -nP "$pattern" "$TMP" | head -20
    VIOLATIONS=$((VIOLATIONS + hits))
  fi
}

# 红线 1+2：入参禁 Map
report_ere '@RequestBody[[:space:]]+Map<' '@RequestBody Map 入参'
report_ere '@RequestParam[[:space:]]+Map<' '@RequestParam Map 查询'

# 红线 3：出参禁 Map
report_ere 'R<Map<' 'R<Map> 出参'
report_ere 'R<List<Map<' 'R<List<Map>> 出参'
report_ere 'R<PageResult<Map<' 'R<PageResult<Map>> 出参'

# 红线 4：出参禁 Entity（启发式 — 子域前缀 + 不以 VO/DTO/Payload/Request/Query 结尾）
# 用 PCRE 负后断言，POSIX ERE 不支持。grep 无 -P 时静默跳过该项。
if echo "" | grep -P "" >/dev/null 2>&1; then
  report_pcre 'public R<Hr(?![A-Za-z]*(VO|DTO|Payload|Request|Query)>)[A-Z][A-Za-z0-9]*>' 'R<HrEntity> 出参'
  report_pcre 'public R<Sys(?![A-Za-z]*(VO|DTO|Payload|Request|Query)>)[A-Z][A-Za-z0-9]*>' 'R<SysEntity> 出参'
  report_pcre 'public R<Oa(?![A-Za-z]*(VO|DTO|Payload|Request|Query)>)[A-Z][A-Za-z0-9]*>' 'R<OaEntity> 出参'
  report_pcre 'public R<Crm(?![A-Za-z]*(VO|DTO|Payload|Request|Query)>)[A-Z][A-Za-z0-9]*>' 'R<CrmEntity> 出参'
else
  echo "[warn] grep 不支持 -P（PCRE），R<Entity> 启发式检查已跳过；ArchUnit 测试仍会守门" >&2
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "============================================================"
  echo "❌ 共 $VIOLATIONS 处新增违规命中红线"
  echo "   修复指引：Controller 入参必须 XxxDTO / XxxQueryDTO；"
  echo "             出参必须 R<XxxVO>，不得返回 R<Map>/R<Entity>。"
  echo "             详见 plan: fluffy-drifting-ladybug.md"
  echo "============================================================"
  exit 1
fi

echo "✅ DTO/Entity/VO 红线 0 命中"
