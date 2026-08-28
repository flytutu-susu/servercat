require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-ssh'
  s.version      = package['version']
  s.summary      = 'SSH client (vendored NMSSH + libssh2 1.11.1/OpenSSL 3.5.1) for ServerCat app'
  s.license      = { :type => 'MIT' }
  s.author       = { 'ServerCat' => 'local' }
  s.homepage     = 'https://example.local'
  s.platforms    = { :ios => '13.4' }
  s.source       = { :git => 'https://example.local/repo.git', :tag => '1.0.0' }
  s.requires_arc = true

  # RNSsh 模块 + vendored NMSSH 源码
  s.source_files        = 'ios/**/*.{h,m,mm}'
  s.public_header_files = 'ios/RNSsh.h'

  # 预编译静态库（CI 中从 Release「deps」下载；libssh2 headers 已随仓库提交）
  s.vendored_libraries  = 'vendor/lib/libssh2.a', 'vendor/lib/libssl.a', 'vendor/lib/libcrypto.a'

  s.libraries  = 'z'
  s.frameworks = 'CFNetwork'

  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => [
      '$(PODS_TARGET_SRCROOT)/ios/Vendor/NMSSH',
      '$(PODS_TARGET_SRCROOT)/ios/Vendor/NMSSH/Config',
      '$(PODS_TARGET_SRCROOT)/ios/Vendor/NMSSH/Protocols',
      '$(PODS_TARGET_SRCROOT)/vendor/include',
    ].map { |p| "\"#{p}\"" }.join(' '),
    'OTHER_LDFLAGS' => '-ObjC',
    # NMSSH 是 2016 年的代码，屏蔽其在新 Xcode 下的告警
    'GCC_WARN_INHIBIT_ALL_WARNINGS' => 'YES',
  }

  s.dependency 'React-Core'
end
