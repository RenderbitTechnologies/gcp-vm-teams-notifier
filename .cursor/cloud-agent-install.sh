#!/usr/bin/env bash
set -euo pipefail

TERRAFORM_VERSION="1.16.1"
if ! terraform version 2>/dev/null | grep -q "v${TERRAFORM_VERSION}$"; then
  command -v unzip >/dev/null || {
    sudo apt-get update -qq
    sudo apt-get install -y -qq unzip
  }
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/terraform.zip" \
    "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
  unzip -o -q "$tmp/terraform.zip" terraform -d "$tmp/bin"
  sudo install -m 755 "$tmp/bin/terraform" /usr/local/bin/terraform
  rm -rf "$tmp"
fi

cd src
npm ci --no-audit --no-fund
cd ..

terraform init -backend=false -input=false -lockfile=readonly
