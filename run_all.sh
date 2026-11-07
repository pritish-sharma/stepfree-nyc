#!/usr/bin/env bash
# Rebuild every output from the five provided CSVs in data/public/.
set -euo pipefail
cd "$(dirname "$0")/pipeline"
python3 01_build_station_table.py > /dev/null
python3 02_optimize_and_evaluate.py > /dev/null
python3 03_figures_and_export.py
cd ..
if command -v node >/dev/null 2>&1; then node tests/test_parity.js; else echo "node not found: skipped JS parity test"; fi
echo "Done. Open app/index.html in a browser."
