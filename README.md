# nosql_template


## Предварительная проверка заданий

<a href=" ./../../../actions/workflows/1_helloworld.yml" >![1. Согласована и сформулирована тема курсовой]( ./../../actions/workflows/1_helloworld.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/2_usecase.yml" >![2. Usecase]( ./../../actions/workflows/2_usecase.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/3_data_model.yml" >![3. Модель данных]( ./../../actions/workflows/3_data_model.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/4_prototype_store_and_view.yml" >![4. Прототип хранение и представление]( ./../../actions/workflows/4_prototype_store_and_view.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/5_prototype_analysis.yml" >![5. Прототип анализ]( ./../../actions/workflows/5_prototype_analysis.yml/badge.svg)</a> 

<a href=" ./../../../actions/workflows/6_report.yml" >![6. Пояснительная записка]( ./../../actions/workflows/6_report.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/7_app_is_ready.yml" >![7. App is ready]( ./../../actions/workflows/7_app_is_ready.yml/badge.svg)</a>

## Запуск (из корня репозитория)

### Docker Compose

1. `cp .env.example .env`
2. `docker compose build --no-cache`
3. `docker compose up`

### Локально

1. `pip install -r requirements.txt`
2. `export MONGODB_URI=mongodb://localhost:27017`
3. `export MONGODB_DB=robots_app`
4. `export AUTH_DEFAULT_USER=admin`
5. `export AUTH_DEFAULT_PASSWORD=admin`
6. `export AUTH_DEFAULT_ROLE=admin`
7. `python3 -m src.db.init_db`

#### Сброс коллекций (`--drop`)

`python3 -m src.db.init_db --drop`

#### Тестовые данные (seed)

Если база пустая, при `python3 -m src.db.init_db` (в Docker это делает сервис `init` после `up`) из `data/json_seed/` сами подставятся тестовые группы, роботы, задачи, события и препятствия. Повторно — только после `--drop` или с новым volume у Mongo.
