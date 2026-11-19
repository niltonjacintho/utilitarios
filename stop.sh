#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/.hub-pids.linux"
SILENT=0

if [ "${1:-}" = "--silent" ]; then
  SILENT=1
fi

log() {
  if [ "$SILENT" -eq 0 ]; then
    echo "$@"
  fi
}

kill_tree() {
  local pid="$1"
  local signal="${2:-TERM}"
  local child

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$signal"
  done

  kill "-$signal" "$pid" 2>/dev/null || true
}

kill_port() {
  local port="$1"
  local pids=""
  local pid

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  fi
  if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
  fi
  if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "$port" 2>/dev/null || true)"
  fi

  for pid in $pids; do
    pid="${pid//[^0-9]/}"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid" TERM
      sleep 0.2
      kill_tree "$pid" KILL
      log "[OK] Processo na porta $port encerrado (PID: $pid)"
    fi
  done
}

kill_project_processes() {
  local pid
  for pid in $(pgrep -f "$ROOT_DIR/(backend|frontend|mindmap|flowchart|erstudio|scripts/run-service\.sh)" 2>/dev/null || true); do
    if [ "$pid" != "$$" ] && [ "$pid" != "$PPID" ] && kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid" TERM
      sleep 0.2
      kill_tree "$pid" KILL
      log "[OK] Processo do projeto encerrado (PID: $pid)"
    fi
  done
}

log "=================================================="
log "  Hub de Prototipos - Encerrando servicos e sessoes"
log "=================================================="
log ""

# 1. Encerra todas as sessoes de terminal e processos filhos registrados pelo start.sh
if [ -f "$PID_FILE" ]; then
  mapfile -t SAVED_PIDS < "$PID_FILE"

  for pid in "${SAVED_PIDS[@]}"; do
    pid="${pid//[^0-9]/}"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid" TERM
    fi
  done

  sleep 0.4

  for pid in "${SAVED_PIDS[@]}"; do
    pid="${pid//[^0-9]/}"
    if [ -n "$pid" ]; then
      if kill -0 "$pid" 2>/dev/null; then
        kill_tree "$pid" KILL
      fi
      log "[OK] Sessao de terminal encerrada (PID: $pid)"
    fi
  done

  rm -f "$PID_FILE"
fi

# 2. Encerra qualquer processo ainda escutando nas portas 3001 (API), 3000 (Hub), 3002 (MindMap), 3003 (Flowchart) e 3004 (ER Studio)
kill_port 3001
kill_port 3000
kill_port 3002
kill_port 3003
kill_port 3004

# 3. Garantia extra contra processos orfaos do projeto
kill_project_processes

log ""
log "=================================================="
log "  API, Hub, MindMap, Flowchart, ER Studio e sessoes encerrados."
log "=================================================="
log ""
