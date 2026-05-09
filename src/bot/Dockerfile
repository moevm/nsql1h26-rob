FROM python:3.11-slim

# Установка системных зависимостей для Pillow (если понадобятся)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем зависимости
COPY src/bot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь исходный код
COPY . .

# Устанавливаем переменную окружения, чтобы Python видел пакеты в src
ENV PYTHONPATH=/app

# Запуск
CMD ["python", "src/bot/bot_sim.py"]
