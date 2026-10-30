#!/bin/bash
# Claude Code cloud environment setup script.
#
# Paste into (or "Choose file" from) the environment's Setup script field at
# claude.ai/code. Runs as root on Ubuntu 24.04 before Claude Code launches and
# before the environment's variables are set; the result is cached for ~7 days.
# Node.js 22 (matching .nvmrc) is pre-installed, so only Terraform is added here.

set -euo pipefail

TERRAFORM_VERSION="1.16.1"

if terraform version 2>/dev/null | grep -q "v${TERRAFORM_VERSION}$"; then
  echo "Terraform ${TERRAFORM_VERSION} already installed"
  exit 0
fi

command -v unzip >/dev/null || { apt-get update -qq && apt-get install -y -qq unzip; }

tmp=$(mktemp -d)
curl -fsSL -o "$tmp/terraform.zip" \
  "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
unzip -o -q "$tmp/terraform.zip" terraform -d /usr/local/bin
chmod +x /usr/local/bin/terraform
rm -rf "$tmp"

terraform version
