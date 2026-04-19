class Petagent < Formula
  desc "Open-source AI employee platform"
  homepage "https://petagent.ai"
  version "0.1.0-m0"
  license "MIT"

  # M0: placeholders. `.github/workflows/release.yml` rewrites url + sha256
  # from GitHub Release artifacts.
  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/YOUR_ORG/petagent/releases/download/v#{version}/petagent-darwin-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/YOUR_ORG/petagent/releases/download/v#{version}/petagent-darwin-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    url "https://github.com/YOUR_ORG/petagent/releases/download/v#{version}/petagent-linux-x64"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end

  def install
    bin.install Dir["petagent-*"].first => "petagent"
  end

  test do
    assert_match "petagent", shell_output("#{bin}/petagent --version")
  end
end
