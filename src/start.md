# Запуск (из корня репозитория)

**Docker Compose**

1. `cp .env.example .env`
2. `docker compose build --no-cache`
3. `docker compose up`

**Локально**

1. `pip install -r requirements.txt`
2. `export MONGODB_URI=mongodb://localhost:27017`
3. `export MONGODB_DB=robots_app`
4. `export AUTH_DEFAULT_USER=admin`
5. `export AUTH_DEFAULT_PASSWORD=admin`
6. `export AUTH_DEFAULT_ROLE=admin`
7. `python3 -m src.db.init_db`

## Сброс коллекций (`--drop`)

`python3 -m src.db.init_db --drop`

## Тестовые данные (seed)

Если база пустая, при `python3 -m src.db.init_db` (в Docker это делает сервис `init` после `up`) из `data/json_seed/` сами подставятся тестовые группы, роботы, задачи, события и препятствия. Повторно — только после `--drop` или с новым volume у Mongo.
