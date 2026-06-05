FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    apt-utils \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster package installation
RUN pip install uv

# Copy pyproject.toml and README first for better caching
COPY pyproject.toml .
COPY README.md .
COPY src/aptly_webui/__init__.py src/aptly_webui/

# Install dependencies
RUN uv pip install --system --no-cache -e ".[dev]"

# Copy rest of application code
COPY . .

# Install the package
RUN uv pip install --system --no-cache -e .

# Create non-root user
RUN useradd -m -u 1000 aptlywebui && chown -R aptlywebui:aptlywebui /app
USER aptlywebui

EXPOSE 8000

CMD ["uvicorn", "aptly_webui.main:app", "--host", "0.0.0.0", "--port", "8000"]
