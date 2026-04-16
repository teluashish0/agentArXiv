FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/chatkit-server/requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r /app/requirements.txt

COPY apps/chatkit-server /app

EXPOSE 8080

CMD ["sh", "-lc", "PYTHONPATH=. python -m uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
