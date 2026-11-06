#!/usr/bin/env bash
# docs/issues/NN-*.md를 GitHub 마일스톤·이슈로 옮긴다.
# 각 파일: 1행 "# [M1] 제목", "마일스톤: M1 기본 장부 · ..." 행.
# 같은 제목의 이슈가 이미 있으면 건너뛴다(두 번 돌려도 안전).
# DRY_RUN=1 이면 만들지 않고 무엇을 만들지만 출력한다.
set -euo pipefail

cd "$(dirname "$0")/.."
dry=${DRY_RUN:-0}

if [ "$dry" != 1 ]; then
  repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  existing_titles=$(gh issue list --state all --limit 500 --json title -q '.[].title')
  existing_milestones=$(gh api "repos/$repo/milestones?state=all&per_page=100" -q '.[].title')
else
  existing_titles=""
  existing_milestones=""
fi

for f in docs/issues/[0-9][0-9]-*.md; do
  title=$(head -n1 "$f" | sed 's/^# //')
  # "마일스톤: M1 기본 장부 · PRD M1" → "M1 기본 장부"
  milestone=$(grep -m1 '^마일스톤:' "$f" | sed -E 's/^마일스톤: *//; s/ · .*$//' || true)
  if [ -z "$milestone" ]; then
    echo "건너뜀(마일스톤 행 없음): $f" >&2
    continue
  fi

  if ! grep -qxF "$milestone" <<<"$existing_milestones"; then
    echo "마일스톤 생성: $milestone"
    if [ "$dry" != 1 ]; then
      gh api "repos/$repo/milestones" -f title="$milestone" >/dev/null
    fi
    existing_milestones+=$'\n'"$milestone"
  fi

  if grep -qxF "$title" <<<"$existing_titles"; then
    echo "이미 있음: $title"
    continue
  fi

  echo "이슈 생성: $title  ← $f  [$milestone]"
  if [ "$dry" != 1 ]; then
    gh issue create --title "$title" --body-file "$f" --milestone "$milestone"
  fi
done
