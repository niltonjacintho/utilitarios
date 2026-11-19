#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
MINDMAP_DIR="$ROOT_DIR/mindmap"
FLOWCHART_DIR="$ROOT_DIR/flowchart"
ERSTUDIO_DIR="$ROOT_DIR/erstudio"
RUNNER="$ROOT_DIR/scripts/run-service.sh"
PID_FILE="$ROOT_DIR/.hub-pids.linux"
LOG_DIR="$ROOT_DIR/.hub-logs"

# Carrega Node/npm via nvm caso nao estejam no PATH padrao
setup_node_path() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
      # shellcheck disable=SC1090
      . "$NVM_DIR/nvm.sh"
    elif [ -d "$NVM_DIR/versions/node" ]; then
      local latest_node
      latest_node="$(ls -1 "$NVM_DIR/versions/node" | sort -V | tail -n 1)"
      if [ -n "$latest_node" ] && [ -d "$NVM_DIR/versions/node/$latest_node/bin" ]; then
        export PATH="$NVM_DIR/versions/node/$latest_node/bin:$PATH"
      fi
    fi
  fi
}

setup_node_path

echo "============================================================"
echo "  Hub de Prototipos - Inicializacao (API + Hub + Apps)"
echo "============================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js nao encontrado no PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERRO] npm nao encontrado no PATH."
  exit 1
fi

NODE_BIN_DIR="$(dirname "$(command -v node)")"

# Garante que nenhuma instancia anterior fique ocupando as portas 3000-3004
"$ROOT_DIR/stop.sh" --silent

if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo "[INFO] Instalando dependencias do backend..."
  npm --prefix "$BACKEND_DIR" install
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "[INFO] Instalando dependencias do frontend (Hub)..."
  npm --prefix "$FRONTEND_DIR" install
fi

if [ ! -d "$MINDMAP_DIR/node_modules" ]; then
  echo "[INFO] Instalando dependencias do MindMap..."
  npm --prefix "$MINDMAP_DIR" install
fi

if [ ! -d "$FLOWCHART_DIR/node_modules" ]; then
  echo "[INFO] Instalando dependencias do Flowchart..."
  npm --prefix "$FLOWCHART_DIR" install
fi

if [ ! -d "$ERSTUDIO_DIR/node_modules" ]; then
  echo "[INFO] Instalando dependencias do ER Studio..."
  npm --prefix "$ERSTUDIO_DIR" install
fi

# Limpa .next se houver build de producao ou estado incompleto antes de subir next dev
for next_dir in "$FRONTEND_DIR" "$FLOWCHART_DIR" "$ERSTUDIO_DIR"; do
  if [ -d "$next_dir/.next" ]; then
    if [ -f "$next_dir/.next/BUILD_ID" ] || [ ! -f "$next_dir/.next/routes-manifest.json" ]; then
      rm -rf "$next_dir/.next"
    fi
  fi
done

: > "$PID_FILE"

launch_in_terminal() {
  local title="$1"
  local workdir="$2"
  local log_name="$3"
  shift 3

  if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
    if command -v ptyxis >/dev/null 2>&1; then
      nohup ptyxis --new-window --title="$title" --working-directory="$workdir" -- bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    elif command -v gnome-terminal >/dev/null 2>&1; then
      nohup gnome-terminal --title="$title" --working-directory="$workdir" -- bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    elif command -v konsole >/dev/null 2>&1; then
      nohup konsole --workdir "$workdir" -p tabtitle="$title" -e bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    elif command -v xfce4-terminal >/dev/null 2>&1; then
      nohup xfce4-terminal --title="$title" --working-directory="$workdir" -x bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    elif command -v kitty >/dev/null 2>&1; then
      nohup kitty --title "$title" --directory "$workdir" bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    elif command -v alacritty >/dev/null 2>&1; then
      nohup alacritty --title="$title" --working-directory="$workdir" -e bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    elif command -v xterm >/dev/null 2>&1; then
      nohup xterm -T "$title" -e bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    elif command -v x-terminal-emulator >/dev/null 2>&1; then
      nohup x-terminal-emulator -e bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" >/dev/null 2>&1 &
      return 0
    fi
  fi

  # Fallback headless (sem interface grafica): inicia em background com logs em arquivo
  mkdir -p "$LOG_DIR"
  nohup bash "$RUNNER" "$PID_FILE" "$NODE_BIN_DIR" "$workdir" "$@" > "$LOG_DIR/$log_name.log" 2>&1 < /dev/null &
  echo "      (modo background — log em .hub-logs/$log_name.log)"
}

echo "[1/5] Iniciando API NestJS (http://localhost:3001/api)..."
launch_in_terminal "HUB_PROTOTIPOS_BACKEND" "$BACKEND_DIR" "backend" npm run start:dev

echo "[2/5] Iniciando Hub Next.js (http://localhost:3000)..."
launch_in_terminal "HUB_PROTOTIPOS_FRONTEND" "$FRONTEND_DIR" "frontend" npm run dev

echo "[3/5] Iniciando MindMap React (http://localhost:3002)..."
launch_in_terminal "HUB_PROTOTIPOS_MINDMAP" "$MINDMAP_DIR" "mindmap" npm run dev

echo "[4/5] Iniciando Flowchart Next.js (http://localhost:3003)..."
launch_in_terminal "HUB_PROTOTIPOS_FLOWCHART" "$FLOWCHART_DIR" "flowchart" npm run dev

echo "[5/5] Iniciando ER Studio Next.js (http://localhost:3004)..."
launch_in_terminal "HUB_PROTOTIPOS_ERSTUDIO" "$ERSTUDIO_DIR" "erstudio" npm run dev

# Aguarda brevemente o registro dos PIDs das 5 sessoes abertas
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if [ "$(wc -l < "$PID_FILE")" -ge 5 ]; then
    break
  fi
  sleep 0.2
done

echo
echo "============================================================"
echo "  Servicos iniciados!"
echo "  - API:       http://localhost:3001/api/hub"
echo "  - Hub:       http://localhost:3000"
echo "  - MindMap:   http://localhost:3002"
echo "  - Flowchart: http://localhost:3003"
echo "  - ER Studio: http://localhost:3004"
echo "  - Para parar tudo, execute: ./stop.sh"
echo "============================================================"
echo
