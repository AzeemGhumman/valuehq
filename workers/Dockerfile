# Worker image: Python + Scrapy + a headless Chromium (for sites that need JavaScript).
# The Playwright base image ships the browser and its system libraries; the playwright Python package in
# pyproject.toml is pinned to the same version.
FROM mcr.microsoft.com/playwright/python:v1.49.1-noble

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY pyproject.toml ./
COPY valuehq_workers ./valuehq_workers
RUN pip install --break-system-packages . && python -c "import scrapy, trafilatura, anthropic, boto3, scrapy_playwright"

COPY tests ./tests
RUN python -m unittest discover -s tests

USER pwuser
ENTRYPOINT ["python", "-m", "valuehq_workers"]
