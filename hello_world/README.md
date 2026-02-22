# Запуск из директории после клонирования

```bash
# 1. Запуск в фоновом режиме
docker compose up -d

# 2. Смотрим логи, что код в контейнере отработал корректно
docker logs robot_init

# Или логи MongoDB
docker logs robot_mongodb

# 3. После работы остановить
docker compose down
```
