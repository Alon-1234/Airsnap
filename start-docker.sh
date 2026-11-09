#!/bin/sh
# ============================================================
#  AirSnap in Docker — macOS / Linux:   ./start-docker.sh
#    App in the browser:  http://localhost:8081
#    Live drone viewer:   http://localhost:4000
#  Stop:  docker compose down
# ============================================================
set -e
cd "$(dirname "$0")"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is not installed. Get Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
}
docker info >/dev/null 2>&1 || { echo "Start Docker Desktop first, then run this again."; exit 1; }

if [ ! -f .env ]; then
  echo "First-time setup: the email you sign in to AirSnap with becomes admin on your copy"
  echo "(so you can place drone hives near you and order for free)."
  printf "Your email: "
  read -r email
  echo "ADMIN_EMAILS=${email:-akonk13579@gmail.com}" > .env
fi

echo "Building and starting AirSnap... the first time takes 5-10 minutes."
# A fresh Docker install sometimes fails the very first build — retry once.
docker compose up --build -d || { echo "First try failed - trying once more..."; docker compose up --build -d; }

printf "Waiting for the app"
i=0
until curl -fsS http://localhost:8081/health >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then echo; echo "Timed out. See: docker compose logs"; exit 1; fi
  printf "."
  sleep 2
done
echo

for url in http://localhost:8081 http://localhost:4000; do
  open "$url" 2>/dev/null || xdg-open "$url" 2>/dev/null || true
done

echo "AirSnap is running:"
echo "  App in your browser:  http://localhost:8081"
echo "  Live drone viewer:    http://localhost:4000"
echo "  Stop it with:         docker compose down"
