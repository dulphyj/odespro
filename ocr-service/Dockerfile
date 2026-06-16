FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
ENV PIP_DEFAULT_TIMEOUT=300
RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir fastapi==0.115.0 uvicorn[standard]==0.30.6 python-multipart==0.0.12 aiofiles==24.1.0 Pillow==11.0.0 numpy==1.26.4 python-dotenv==1.0.1 httpx==0.27.2 pdf2image==1.17.0
RUN pip install --no-cache-dir paddlepaddle==2.6.2 && pip install --no-cache-dir paddleocr==2.8.1
COPY . .
EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
