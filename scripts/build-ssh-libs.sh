#!/usr/bin/env bash
# 为 iOS (arm64, iphoneos) 编译 OpenSSL 3.5 + libssh2 1.11.1 静态库
# 输出: modules/react-native-ssh/vendor/lib/{libcrypto.a,libssl.a,libssh2.a}
# 仅在 macOS (GitHub Actions runner) 上运行。
set -euo pipefail

OPENSSL_VER=3.5.1
LIBSSH2_VER=1.11.1
MIN_IOS=13.0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.deps-build"
OUT="$ROOT/modules/react-native-ssh/vendor"
LIB_OUT="$OUT/lib"
DEPS_PREFIX="$WORK/prefix"

rm -rf "$WORK"
mkdir -p "$WORK" "$LIB_OUT" "$DEPS_PREFIX"

cd "$WORK"

echo "== 下载源码 =="
curl -fSL --retry 3 -o openssl.tar.gz "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VER}/openssl-${OPENSSL_VER}.tar.gz"
curl -fSL --retry 3 -o libssh2.tar.gz "https://github.com/libssh2/libssh2/releases/download/libssh2-${LIBSSH2_VER}/libssh2-${LIBSSH2_VER}.tar.gz"
tar xzf openssl.tar.gz
tar xzf libssh2.tar.gz

echo "== 编译 OpenSSL ${OPENSSL_VER} (ios64-cross, arm64) =="
cd "openssl-${OPENSSL_VER}"
# 显式指定 SDK（xcrun 自动发现不可靠）
SDKROOT_PATH="$(xcrun --sdk iphoneos --show-sdk-path)"
export CROSS_TOP="$(xcode-select -p)/Platforms/iPhoneOS.platform/Developer"
export CROSS_SDK="iPhoneOS.sdk"
./Configure ios64-cross no-shared no-tests \
  --prefix="$DEPS_PREFIX" \
  -isysroot "$SDKROOT_PATH" -arch arm64 "-miphoneos-version-min=${MIN_IOS}"
make -j"$(sysctl -n hw.ncpu)" build_libs
make install_sw
ls -lh "$DEPS_PREFIX/lib/"

echo "== 编译 libssh2 ${LIBSSH2_VER} (CMake, iOS arm64) =="
cd "$WORK/libssh2-${LIBSSH2_VER}"
cmake -S . -B build-ios \
  -DCMAKE_SYSTEM_NAME=iOS \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET="${MIN_IOS}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_STATIC_LIBS=ON \
  -DCRYPTO_BACKEND=OpenSSL \
  -DOPENSSL_ROOT_DIR="$DEPS_PREFIX" \
  -DBUILD_EXAMPLES=OFF \
  -DBUILD_TESTING=OFF \
  -DBUILD_DOCS=OFF \
  -DENABLE_ZLIB_COMPRESSION=ON
cmake --build build-ios --config Release -j"$(sysctl -n hw.ncpu)"

echo "== 收集产物 =="
cp "$DEPS_PREFIX/lib/libcrypto.a" "$LIB_OUT/"
cp "$DEPS_PREFIX/lib/libssl.a" "$LIB_OUT/"
find build-ios -name 'libssh2.a' -exec cp {} "$LIB_OUT/" \;
ls -lh "$LIB_OUT"

# 校验 arm64 切片
for f in "$LIB_OUT"/*.a; do
  echo "-- $(basename "$f") --"
  lipo -info "$f" || true
done

echo "✔ 完成: $LIB_OUT"
