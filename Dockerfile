# Setup Python Backend - EXTREME OPTIMIZATION
FROM python:3.11-slim

# Install system dependencies
# WeasyPrint + Cairo + Ghostscript for PDF compression
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
    # Cleanup to keep image small
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security (required by HF Spaces)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Set up working directory
WORKDIR $HOME/app

# Copy the backend code
COPY --chown=user backend $HOME/app

# Create output folder for PDFs and Jinja2 cache
RUN mkdir -p $HOME/app/output && chmod 777 $HOME/app/output
RUN mkdir -p /tmp/jinja2_cache && chmod 777 /tmp/jinja2_cache

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose the API port (Hugging Face Spaces uses 7860)
EXPOSE 7860

# Run the application on port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
