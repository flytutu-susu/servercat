require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-ssh'
  s.version      = package['version']
  s.summary      = 'SSH client (NMSSH/libssh2) for ServerCat app'
  s.license      = { :type => 'MIT' }
  s.author       = { 'ServerCat' => 'local' }
  s.homepage     = 'https://example.local'
  s.platforms    = { :ios => '13.4' }
  s.source       = { :git => 'https://example.local/repo.git', :tag => '1.0.0' }
  s.source_files = 'ios/**/*.{h,m,mm}'
  s.requires_arc = true

  s.dependency 'React-Core'
  s.dependency 'NMSSH'
end
