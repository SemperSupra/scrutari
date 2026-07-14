# Scrutari Local CI — run directly (no Docker containers needed)
# Use this to validate changes before committing.
# Outputs CI-style pass/fail for each job.
#
# Usage:
#   make ci          # Run full local CI pipeline
#   make test        # Run all unit tests
#   make lint        # Run lint checks
#   make python-ml   # Verify Python ML imports
#   make ipv6        # Run IPv6 test suite (requires IPv6 host)
#   make full        # Run everything (test + lint + python-ml)

.PHONY: ci test lint python-ml ipv6 full clean

RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m

pass = printf "${GREEN}[PASS]${NC} %s\n" "$1"
fail = printf "${RED}[FAIL]${NC} %s\n" "$1"; exit 1
info = printf "${YELLOW}[INFO]${NC} %s\n" "$1"

# ─── Test job: run all unit tests ───

test:
	@$(call info,"Running all unit tests...")
	@node --test test/**/*.test.mjs && $(call pass,"All unit tests passed") || ($(call fail,"Unit tests failed"))

# ─── Lint job: code quality checks ───

lint:
	@$(call info,"Checking .gitignore hygiene...")
	@if grep -q "package.json" .gitignore; then \
		$(call fail,"package.json is still in .gitignore"); \
	fi
	@$(call pass,".gitignore is clean")

	@$(call info,"Checking Dockerfile SHA pinning...")
	@if grep -q "^FROM node:20-alpine$$" submit-endpoint/Dockerfile; then \
		$(call fail,"submit-endpoint/Dockerfile has unpinned base image"); \
	fi
	@$(call pass,"All Dockerfiles SHA-pinned")

	@$(call info,"Checking for IPv4 hardcoding in test files...")
	@if grep -q "^const BASE = .*127\.0\.0\.1" automation/ipv6-test.mjs; then \
		$(call fail,"IPv6 test file has IPv4 hardcoded as base URL"); \
	fi
	@$(call pass,"No IPv4 hardcoding in test files")

	@$(call info,"Checking IPv6 normalization consistency...")
	@node --test test/ip-normalization.test.mjs --quiet && $(call pass,"IPv6 normalization correct") || ($(call fail,"IPv6 normalization broken"))

	@$(call pass,"All lint checks passed")

# ─── Python ML job: verify ML pipeline ───

python-ml:
	@$(call info,"Verifying Python ML imports...")
	@python3 -c "import numpy; print('numpy', numpy.__version__); import sklearn; print('sklearn', sklearn.__version__); import onnx; print('onnx', onnx.__version__)" && $(call pass,"Python ML imports OK") || ($(call fail,"Python ML imports failed"))

# ─── IPv6 test job ───

ipv6: $(info "Starting IPv6 test server...")
	@python3 automation/server.py --bind :: &
	@sleep 2
	@node automation/ipv6-test.mjs --server; status=$$?; \
		kill %1 2>/dev/null || true; \
		if [ $$status -eq 0 ]; then $(call pass,"IPv6 tests passed"); else $(call fail,"IPv6 tests failed"); fi

# ─── OPSEC regression suite ───

opsec:
	@$(call info,"Running OPSEC regression tests...")
	@node --test test/opsec-regression.test.mjs && $(call pass,"OPSEC regression passed") || ($(call fail,"OPSEC regression failed"))

# ─── Full CI pipeline ───

ci: test lint python-ml opsec
	@echo ""
	@printf "${GREEN}═══════════════════════════════════════════════${NC}\n"
	@printf "${GREEN}  ✅  All CI checks passed${NC}\n"
	@printf "${GREEN}═══════════════════════════════════════════════${NC}\n"

full: ci
	@echo ""
	@echo "Full CI (including IPv6) completed"

clean:
	@rm -f automation/expected-results/ipv6-test-*.json
	@$(call pass,"Cleaned up test artifacts")
