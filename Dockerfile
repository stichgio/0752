# Setup Python Backend
FROM python:3.11-slim

# Install system dependencies
# WeasyPrint requires: libcairo2, libpango-1.0-0, libpangoft2-1.0-0, libgdk-pixbuf2.0-0, libffi-dev, shared-mime-info
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-cffi \
    python3-brotli \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
    libjpeg-dev \
    libopenjp2-7-dev \
    libffi-dev \
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

# Create output folder for PDFs if needed and ensure permissions
RUN mkdir -p $HOME/app/output && chmod 777 $HOME/app/output

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose the API port (Hugging Face Spaces uses 7860)
EXPOSE 7860

# Run the application on port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
