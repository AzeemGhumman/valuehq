#!/usr/bin/env bash
# Builds everything template.yaml deploys:
#   build/web     Next.js standalone server + run.sh (started by the Lambda Web Adapter)
#   build/static  /_next/static files, uploaded to S3 by deploy.sh
#   build/jobs    the background-job Lambda, bundled with esbuild
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf build .next
npx next build

mkdir -p build/web build/static/_next build/jobs
cp -R .next/standalone/. build/web/
[ -d public ] && cp -R public build/web/public
cp -R .next/static build/static/_next/static
printf '#!/bin/bash\nexec node server.js\n' > build/web/run.sh
chmod +x build/web/run.sh

npx esbuild src/jobs/handler.ts --bundle --platform=node --target=node22 --format=cjs \
  --outfile=build/jobs/handler.js '--external:@aws-sdk/*' --tsconfig=tsconfig.json --log-level=warning

echo "Built build/web ($(du -sh build/web | cut -f1)), build/static, build/jobs."
