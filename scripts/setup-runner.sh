#!/bin/bash
set -e

# ==============================================================================
# Script cài đặt GitHub Actions Self-Hosted Runner cho WorkHub (macOS ARM64)
# ==============================================================================

RUNNER_DIR="$HOME/actions-runner"
REPO_URL="https://github.com/duynk-tech/WorkHub"
RUNNER_VERSION="2.322.0"
ARCH=$(uname -m)

if [ "$ARCH" = "arm64" ]; then
  RUNNER_ARCH="arm64"
else
  RUNNER_ARCH="x64"
fi

echo "=========================================================="
echo "  Cài đặt GitHub Actions Self-Hosted Runner cho WorkHub"
echo "  Hệ điều hành: macOS ($RUNNER_ARCH)"
echo "  Thư mục cài đặt: $RUNNER_DIR"
echo "=========================================================="

# 1. Nhận token đăng ký
TOKEN="$1"
if [ -z "$TOKEN" ]; then
  echo ""
  echo "Để lấy Registration Token từ GitHub:"
  echo "1. Mở trình duyệt truy cập: $REPO_URL/settings/actions/runners/new?arch=$RUNNER_ARCH&os=osx"
  echo "2. Tìm dòng: ./config.sh --url $REPO_URL --token <TOKEN>"
  echo ""
  read -p "👉 Dán Registration Token vào đây: " TOKEN
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Token không được để trống!"
  exit 1
fi

# 2. Tạo thư mục runner
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

# 3. Tải runner package nếu chưa có
TAR_FILE="actions-runner-osx-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
if [ ! -f "$TAR_FILE" ]; then
  echo "📥 Đang tải GitHub Actions Runner v${RUNNER_VERSION}..."
  curl -o "$TAR_FILE" -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TAR_FILE}"
  tar xzf "$TAR_FILE"
fi

# 4. Cấu hình runner
echo "⚙️ Đang cấu hình runner với repo $REPO_URL..."
./config.sh --url "$REPO_URL" --token "$TOKEN" --name "$(hostname)-workhub-runner" --unattended --replace

# 5. Cài đặt và khởi chạy runner dưới dạng macOS service (chạy nền)
echo "🚀 Đang cài đặt runner service (chạy nền tự động)..."
./svc.sh install
./svc.sh start

echo ""
echo "=========================================================="
echo "✅ Cài đặt Runner thành công!"
echo "Runner hiện đang chạy ngầm trên máy này."
echo "Mỗi khi bạn 'git push' lên nhánh main, GitHub sẽ tự động gọi runner"
echo "để pull code và build lại Docker container WorkHub."
echo "=========================================================="
