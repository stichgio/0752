# Backend-only Dockerfile for Hugging Face Spaces
# Frontend is deployed separately on Vercel
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/home/user/.local/bin:$PATH" \
    PYTHONPATH="/home/user/app" \
    HOME=/home/user

# Install system dependencies
# WeasyPrint + Cairo + Ghostscript for PDF compression + curl for healthchecks
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-cffi \
    python3-brotli \
    # Cairo y Pango (WeasyPrint + CairoCFFI)
    libcairo2-dev \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libharfbuzz-subset0 \
    # Imagen processing
    libjpeg-dev \
    libopenjp2-7-dev \
    zlib1g-dev \
    libffi-dev \
    # Ghostscript para compresión de PDFs
    ghostscript \
    # Fonts
    fonts-liberation \
    fontconfig \
    # Utils
    curl \
    git \
    # Cleanup to keep image small
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security (required by HF Spaces)
RUN useradd -m -u 1000 user
USER user

# Set up working directory
WORKDIR $HOME/app

# Copy and install Python dependencies first (for better caching)
COPY --chown=user backend/requirements.txt $HOME/app/requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

# Pre-download RapidOCR models to avoid runtime DNS/network issues (curl: (6) Could not resolve host)
# This moved the networking step to build-time which is more robust on HF Spaces.
RUN python3 -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()" || true

# Copy the rest of the backend code
COPY --chown=user backend $HOME/app

# Create necessary folders and set permissions
RUN mkdir -p $HOME/app/output $HOME/app/data $HOME/.cache \
    && chmod -R 755 $HOME/app/output $HOME/app/data $HOME/.cache


# Expose the API port (Hugging Face Spaces uses 7860)
EXPOSE 7860

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
