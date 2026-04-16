# Decentrathon Certificates Platform TODO

## 1. Цель документа

Этот файл фиксирует адекватный план реализации платформы генерации сертификатов для Decentrathon с привязкой к текущему репозиторию:

- `backend/api` — HTTP API, авторизация, rate limit, генерация сертификатов, protected routes
- `backend/entity` — модели БД
- `backend/db-migration` — миграции
- `frontend/app` — публичная часть и админка
- `uploads/` — шаблоны и сгенерированные PDF в локальной среде

Документ разделен на:

- страницы и UX-сценарии
- backend-функционал и API
- модель данных
- безопасность
- нагрузка и cluster-настройка
- дорожную карту: MVP, v1, post-MVP

## 2. Текущий статус проекта

Что уже есть в репозитории:

- есть каркас Rust backend на `Actix Web`
- есть rate limit для `public` и `admin` scopes
- есть начальная схема БД для:
  - админов
  - refresh sessions
  - шаблонов сертификатов
  - layout-настроек шаблона
  - участников
  - выданных сертификатов
  - app settings
- есть базовые страницы:
  - `frontend/app/page.tsx`
  - `frontend/app/admin/page.tsx`
- есть настройки `JWT`, `workers`, storage-пути в конфиге
- есть отдельная CLI-утилита для первичного bootstrap админа
- backend применяет миграции при старте, чтобы dev-окружение само поднимало схему

Что уже закрыто в первой фазе:

- backend получил отдельный `auth` domain с `login`, `refresh`, `logout`, `me`
- admin scope теперь проходит через JWT middleware и role checks
- `issuance_enabled` больше не живет только в `.env`, а хранится в `app_settings`
- `system/health` показывает состояние storage и runtime-конфиг, а не только флаг из env
- storage-стратегия для `uploads/templates` и `uploads/generated` вынесена в отдельный сервис
- есть `seed-admin` CLI для создания первого администратора

К чему пришли:

- foundation-слой backend теперь готов для public issuance и admin MVP
- следующая практическая работа идет по `Этапу 2. Public issuance MVP`
- публичная выдача сертификатов и серверная PDF-генерация теперь реализованы в MVP-форме
- админский bootstrap теперь тоже закрыт через отдельную CLI-утилиту

Что пока не реализовано по факту:

- нет импорта XLSX
- нет drag-and-drop редактора layout
- нет verification page
- нет audit log действий админа

## 3. Продуктовые модули

### 3.1. Публичная часть

Цель:

- пользователь вводит `e-mail`
- backend проверяет участника по базе
- backend генерирует PDF-сертификат на сервере
- пользователь скачивает готовый файл

### 3.2. Админ-панель

Цель:

- логин/пароль
- JWT access token + refresh session
- загрузка шаблонов
- настройка layout шаблона
- загрузка базы участников
- включение/выключение выдачи
- просмотр статистики и состояния системы

### 3.3. Сертификаты и верификация

Цель:

- выдавать каждому участнику предсказуемый и повторяемый сертификат
- иметь `certificate_id`
- иметь `verification_code` и ссылку/QR на страницу проверки

## 4. Подробное описание страниц

## 4.1. Публичная страница `/`

Назначение:

- единая entry-point страница для участников

Состав страницы:

- поле ввода `e-mail`
- кнопка `Получить сертификат`
- зона статуса запроса
- кнопка скачивания PDF после успешной генерации
- краткое объяснение сценария

Состояния UI:

- `idle`: подсказка "Введите e-mail, который использовался при регистрации"
- `loading`: блокировка формы, индикатор обработки
- `success`: сообщение "Сертификат готов" + кнопка скачивания
- `not_found`: сообщение "Данный e-mail не найден в базе участников"
- `issuance_disabled`: сообщение "Выдача сертификатов еще не открыта"
- `error`: сообщение "Произошла ошибка. Попробуйте позже"
- `rate_limited`: сообщение о временном ограничении запросов

Frontend-задачи:

- перевести текущую демо-форму на реальный запрос к backend
- нормализовать обработку ответов API по статусам
- не раскрывать лишнюю информацию о пользователе
- не показывать имя пользователя до серверной валидации

Backend-зависимости:

- endpoint поиска/выдачи сертификата
- rate limit
- CAPTCHA или pluggable anti-bot защита

Критерий готовности:

- пользователь может получить и скачать PDF только по e-mail, присутствующему в базе

## 4.2. Страница админ-логина `/admin/login`

Назначение:

- точка входа администратора

Состав страницы:

- поле `login`
- поле `password`
- кнопка входа
- сообщения об ошибке

Поведение:

- отправка credentials на backend
- получение `access token`
- получение `refresh token` через httpOnly cookie или безопасную сессионную схему
- редирект в админ-панель после успешного входа

Обязательные меры:

- ограничение попыток логина
- единообразная ошибка без раскрытия, что именно неверно
- закрытие страницы для уже авторизованного администратора

## 4.3. Главная страница админки `/admin`

Назначение:

- краткая сводка состояния системы

Блоки:

- текущий статус выдачи: `enabled/disabled`
- активный шаблон
- количество участников в текущей базе
- количество выданных сертификатов
- последние действия администратора
- быстрые переходы к управлению шаблонами и импортом

Критерий готовности:

- админ видит реальное operational state без захода в БД или логи

## 4.4. Страница шаблонов `/admin/templates`

Назначение:

- загрузка и управление шаблонами сертификатов

Состав страницы:

- список загруженных шаблонов
- форма загрузки нового шаблона
- фильтр по формату
- действия:
  - `Загрузить`
  - `Сделать активным`
  - `Редактировать layout`
  - `Удалить`
  - `Заменить файл`

Поддерживаемые форматы:

- `PNG`
- `JPG/JPEG`
- `PDF`

Backend-валидации:

- проверка MIME type и расширения
- лимит размера файла
- безопасное имя файла / переименование на сервере
- запрет исполнения или чтения шаблонов напрямую с фронта

## 4.5. Страница редактора шаблона `/admin/templates/[id]/layout`

Назначение:

- настроить, где и как выводится имя участника

Настраиваемые параметры:

- `name_x`
- `name_y`
- `name_max_width`
- `font_family`
- `font_size`
- `font_color_hex`
- `text_align`
- `auto_shrink`
- размеры страницы/холста

Желательно в UI:

- preview на основе загруженного шаблона
- тестовое имя для превью
- drag-and-drop позиционирование
- поля точной настройки координат
- моментальное обновление превью после изменения настроек

Критичные backend-задачи:

- сохранить layout отдельно от файла шаблона
- возвращать preview-safe данные
- иметь endpoint для server-side preview generation

## 4.6. Страница импорта участников `/admin/participants`

Назначение:

- загрузка и обновление базы участников

Состав страницы:

- upload area для `CSV/XLSX`
- блок правил импорта
- результат валидации файла
- статистика:
  - сколько строк прочитано
  - сколько добавлено
  - сколько обновлено
  - сколько строк отклонено
- таблица ошибок импорта

Минимальные поля:

- `email`
- `full_name`

Дополнительные поля:

- `event_code`
- `category`
- произвольный `metadata`

Правила импорта:

- e-mail нормализуется на сервере
- пустые строки игнорируются
- дубликаты внутри файла должны детектиться
- дубликаты в БД должны обрабатываться как `upsert` по `(event_code, email_normalized)`
- файл не должен становиться доступным напрямую из браузера

## 4.7. Страница управления выдачей `/admin/issuance`

Назначение:

- включать или выключать выдачу сертификатов

Состав страницы:

- текущий статус выдачи
- переключатель `enabled/disabled`
- активный event/template
- предупреждение, если:
  - нет активного шаблона
  - не загружены участники
  - layout не настроен

Поведение:

- backend не должен разрешать включение выдачи, если система не готова
- изменение статуса должно логироваться

## 4.8. Страница выданных сертификатов `/admin/certificates`

Назначение:

- операционный контроль выдачи

Состав страницы:

- список выданных сертификатов
- поиск по `e-mail`, `certificate_id`, `verification_code`
- дата выдачи
- количество скачиваний
- последнее скачивание
- повторная генерация при необходимости

Для MVP:

- можно отложить полноценную таблицу, но backend-модель и API закладывать сразу

## 4.9. Страница верификации `/verify/[code]`

Назначение:

- проверить подлинность сертификата по коду или QR

Состав страницы:

- статус сертификата: валиден / не найден
- `certificate_id`
- имя участника
- шаблон/событие
- дата генерации

Для MVP:

- желательно заложить данные в БД сразу
- саму страницу можно перенести в `v1`, если сроки жесткие

## 5. Backend: подробный функционал

## 5.1. Public API

### `POST /api/v1/public/certificates/request`

Назначение:

- принять `email`
- проверить, включена ли выдача
- найти участника
- найти активный шаблон и layout
- сгенерировать или переиспользовать сертификат
- вернуть метаданные и ссылку/маркер скачивания

Логика:

1. Валидировать e-mail
2. Проверить глобальный флаг выдачи
3. Нормализовать e-mail
4. Найти участника по `email_normalized`
5. Найти активный шаблон
6. Проверить наличие layout
7. Если сертификат уже существует:
   - вернуть существующий результат
8. Если сертификат не существует:
   - сгенерировать `certificate_id`
   - сгенерировать `verification_code`
   - отрендерить PDF
   - сохранить запись в `certificate_issues`
9. Вернуть response для фронта

Ответы:

- `200 OK` — сертификат готов
- `403 Forbidden` — выдача отключена
- `404 Not Found` — e-mail не найден
- `422 Unprocessable Entity` — невалидный e-mail
- `429 Too Many Requests` — превышен лимит
- `500 Internal Server Error` — внутренняя ошибка

### `GET /api/v1/public/certificates/{certificate_id}/download`

Назначение:

- выдать PDF на скачивание

Логика:

- проверить существование записи
- безопасно отдать файл с диска/object storage
- увеличить `download_count`
- обновить `last_downloaded_at`

Важно:

- ссылка должна быть контролируемой сервером, не прямым путем к файлу в `uploads/`

### `GET /api/v1/public/certificates/verify/{verification_code}`

Назначение:

- API для verification page

Статус:

- `v1`, но модель лучше поддержать уже в MVP

## 5.2. Admin Auth API

### `POST /api/v1/admin/auth/login`

Назначение:

- авторизация админа по логину и паролю

Логика:

- найти админа по `login`
- проверить `password_hash`
- проверить `is_active`
- создать access JWT
- создать refresh session
- сохранить hash refresh token
- вернуть access token и профиль роли

Обязательно:

- `argon2` или аналогичный безопасный password hash
- логирование попыток входа
- rate limit

### `POST /api/v1/admin/auth/refresh`

Назначение:

- безопасное продление сессии

Логика:

- проверить refresh token
- проверить session в БД
- проверить срок действия и `revoked_at`
- выпустить новый access token
- при необходимости ротировать refresh token

### `POST /api/v1/admin/auth/logout`

Назначение:

- завершение сессии

Логика:

- отозвать refresh session
- удалить/инвалидировать refresh cookie

### `GET /api/v1/admin/auth/me`

Назначение:

- вернуть текущего администратора и роль

## 5.3. Admin Templates API

### `POST /api/v1/admin/templates`

- загрузка шаблона
- сохранение файла в storage
- создание записи `certificate_templates`

### `GET /api/v1/admin/templates`

- список шаблонов
- отметка активного

### `GET /api/v1/admin/templates/{id}`

- карточка шаблона
- layout
- preview path / preview endpoint

### `PATCH /api/v1/admin/templates/{id}`

- изменение имени
- замена файла

### `POST /api/v1/admin/templates/{id}/activate`

- деактивировать предыдущий активный шаблон
- активировать выбранный

### `DELETE /api/v1/admin/templates/{id}`

- удаление шаблона
- запрет удаления, если шаблон используется и это ломает инварианты

## 5.4. Admin Layout API

### `PUT /api/v1/admin/templates/{id}/layout`

- сохранить координаты и типографику

### `POST /api/v1/admin/templates/{id}/preview`

- сгенерировать preview с тестовым именем
- вернуть blob/image/pdf preview

## 5.5. Admin Participants API

### `POST /api/v1/admin/participants/import`

Назначение:

- загрузка CSV/XLSX
- парсинг файла
- валидация колонок
- импорт участников

Ответ должен содержать:

- `total_rows`
- `inserted`
- `updated`
- `skipped`
- `errors`

### `GET /api/v1/admin/participants`

- список участников
- пагинация
- фильтр по e-mail/category/event

### `DELETE /api/v1/admin/participants`

- очистка текущего набора по событию
- только с подтверждением и audit log

## 5.6. Admin Issuance API

### `GET /api/v1/admin/issuance/status`

- статус выдачи
- активный шаблон
- число участников
- readiness flags

### `PATCH /api/v1/admin/issuance/status`

- включение/выключение выдачи
- проверка готовности системы перед `enabled=true`

## 5.7. Admin Certificates API

### `GET /api/v1/admin/certificates`

- список выданных сертификатов
- пагинация и поиск

### `GET /api/v1/admin/certificates/{id}`

- детали выдачи

### `POST /api/v1/admin/certificates/{id}/regenerate`

- повторная генерация PDF
- использовать осторожно, логировать отдельно

## 5.8. System API

### `GET /api/v1/system/health`

Уже существует, но стоит расширить:

- доступность БД
- доступность Redis
- состояние storage
- version/build info
- число workers

## 6. Backend: внутренние сервисы и модули

В `backend/api/src/` нужно выделить отдельные модули, чтобы роуты не разрастались.

### 6.1. `services/auth`

Задачи:

- login/password verification
- JWT generation/validation
- refresh token rotation
- role extraction

### 6.2. `services/participants`

Задачи:

- normalize email
- import CSV/XLSX
- upsert participants
- search participant by email

### 6.3. `services/templates`

Задачи:

- upload template
- validate file format
- activate/deactivate template
- manage preview

### 6.4. `services/layouts`

Задачи:

- save layout settings
- build preview payload
- calculate text box and auto-shrink font

### 6.5. `services/certificates`

Задачи:

- issue certificate
- generate PDF from template + layout + participant
- generate certificate identifiers
- track downloads
- verify certificate

### 6.6. `services/settings`

Задачи:

- хранение operational settings в `app_settings`
- `issuance_enabled`
- active event code
- feature toggles

### 6.7. `services/audit`

Задачи:

- логирование admin действий
- логирование включения/выключения выдачи
- логирование импорта и удаления данных

Для этого потребуется новая таблица, например:

- `admin_audit_logs`

## 7. Модель данных: что уже есть и что нужно уточнить

### Уже есть

- `admins`
- `refresh_sessions`
- `certificate_templates`
- `template_layouts`
- `participants`
- `certificate_issues`
- `app_settings`

### Нужно уточнить/добавить

- `admin_audit_logs`
- возможно `participant_import_jobs`
- возможно `template_assets_fonts`, если будут кастомные шрифты
- возможно поле `event_code` в `certificate_templates`, если потребуется несколько потоков и событий

### Изменения, которые стоит проверить в миграциях

- хранение `issuance_enabled` не только в env, но и в БД
- уникальность активного шаблона
- индексы для поиска по:
  - `certificate_id`
  - `verification_code`
  - `participants.email_normalized`
- привязка сертификата к `event_code`
- хранение типа сертификата/трека

## 8. Генерация сертификатов

Обязательные требования:

- генерация выполняется только на сервере
- имя подставляется только из БД
- итоговый результат для MVP — `PDF`

Нужно определить техническую реализацию:

- если шаблон `PNG/JPG`: рендерить поверх изображения и затем собирать PDF
- если шаблон `PDF`: накладывать текст поверх PDF-страницы

Ключевые задачи:

- выбрать библиотеку рендера PDF/text overlay для Rust
- поддержать шрифты
- реализовать `auto_shrink` для длинных имен
- реализовать QR-код с verification URL
- сделать deterministic output path и безопасное хранение

Критерий готовности:

- одно и то же входное состояние дает корректный PDF без ручных правок

## 9. Безопасность

Обязательно реализовать:

- JWT access token auth для admin API
- refresh token flow
- route protection в frontend и backend
- role-based access check для admin routes
- rate limit на public issuance endpoint
- rate limit и lockout/slowdown на admin login
- все проверки только на сервере
- скрытие данных участников от публичной части
- отсутствие прямого доступа к storage с фронта
- безопасная обработка upload-файлов

Желательно реализовать:

- CAPTCHA на публичной форме
- отдельный поддомен для админки
- HTTPS
- аудит действий админа
- истечение access token по времени
- ротация refresh token

## 10. Cluster и нагрузка

Цель:

- выдержать массовую выдачу для `5000+` участников

Что нужно сделать:

- использовать `Actix` workers на основе `HTTP_WORKERS`
- вынести тяжелую генерацию в controlled service layer
- не делать повторную генерацию одного и того же сертификата без необходимости
- кешировать уже выпущенные PDF
- добавить Redis для:
  - rate limit
  - lock/anti-duplicate issuance
  - фоновых задач при необходимости
- настроить reverse proxy перед backend
- предусмотреть запуск нескольких инстансов backend

Базовая cluster-настройка для MVP:

- корректный `workers` конфиг
- readiness/health endpoint
- безопасное файловое storage или общий volume
- дедупликация одновременных запросов на один и тот же e-mail

Для production:

- object storage вместо локального диска
- shared Redis
- shared DB
- orchestration через Docker Swarm/Kubernetes/systemd + reverse proxy

## 11. Frontend TODO по каталогам

## 11.1. `frontend/app/page.tsx`

- подключить реальный submit к public API
- обработать все статусы из ТЗ
- добавить состояние загрузки
- показать download CTA только после успешного ответа
- не хранить лишние чувствительные данные в клиенте

## 11.2. `frontend/app/admin`

Нужно разнести текущий один экран на отдельные страницы:

- `frontend/app/admin/login/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/admin/templates/page.tsx`
- `frontend/app/admin/templates/[id]/page.tsx`
- `frontend/app/admin/templates/[id]/layout/page.tsx`
- `frontend/app/admin/participants/page.tsx`
- `frontend/app/admin/issuance/page.tsx`
- `frontend/app/admin/certificates/page.tsx`

Нужно добавить:

- layout для админки
- route guard
- token/session management
- API client layer

## 11.3. `frontend/components`

Нужно добавить переиспользуемые компоненты:

- `EmailRequestForm`
- `StatusAlert`
- `DownloadCertificateButton`
- `AdminLoginForm`
- `TemplateUploadForm`
- `TemplatePreview`
- `LayoutEditor`
- `ParticipantsImportForm`
- `IssuanceToggleCard`
- `CertificatesTable`

## 12. Backend TODO по каталогам

## 12.1. `backend/api/src/routes/public.rs`

- реализовать реальную выдачу сертификата
- нормализовать response schema
- добавить download endpoint
- добавить verification endpoint

## 12.2. `backend/api/src/routes/admin.rs`

- вынести login в отдельный auth-модуль
- добавить protected endpoints
- разделить routes по доменам:
  - `auth`
  - `templates`
  - `participants`
  - `issuance`
  - `certificates`

## 12.3. `backend/api/src/app.rs`

- добавить middleware для JWT auth
- разделить публичный и админский pipeline
- настроить CORS при необходимости
- учесть trusted proxy headers

## 12.4. `backend/api/src/state.rs`

- добавить доступ к Redis
- добавить shared services/config caches

## 12.5. `backend/db-migration`

- миграция для audit logs
- миграция для возможных import jobs
- миграция для operational settings в БД

## 13. MVP scope

В MVP обязательно должно войти:

- публичная страница ввода e-mail
- серверная проверка e-mail по базе
- генерация сертификата
- скачивание PDF
- админ-логин
- JWT token authentication
- защита admin routes
- загрузка шаблона
- настройка позиции имени
- загрузка CSV/XLSX с участниками
- включение и выключение выдачи
- базовая cluster-настройка

## 14. V1 после MVP

- verification page
- QR-код
- statistics dashboard
- audit log UI
- поддержка нескольких шаблонов по категориям
- фильтрация по `event_code`
- повторная генерация сертификата из админки

## 15. Приоритеты реализации

### Этап 1. Foundation

- [x] Завершить auth domain на backend
- [x] Добавить JWT middleware и role checks
- [x] Перенести `issuance_enabled` в БД settings
- [x] Подготовить storage-стратегию для templates/generated files

Фактически сделано:

- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/refresh`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`
- `GET /api/v1/admin/issuance/status`
- `PATCH /api/v1/admin/issuance/status`
- middleware для проверки bearer JWT на защищенных admin routes
- storage healthcheck и DB-backed app settings для issuance state

Результат этапа:

- backend теперь может аутентифицировать администратора и держать runtime-настройки в БД
- admin routes больше не выглядят как заглушки и готовы к следующему слою функциональности
- публичная часть пока остается на `NotImplemented`, но уже опирается на правильный foundation

### Этап 2. Public issuance MVP

- [x] Реализовать поиск участника по e-mail
- [x] Реализовать генерацию PDF на сервере
- [x] Реализовать скачивание готового сертификата
- [x] Подключить публичную форму frontend к API
- [x] Обработать все пользовательские статусы

### Этап 3. Admin MVP

- [x] Сделать страницу логина
- [x] Сделать upload шаблонов
- [x] Сделать layout editor с preview
- [x] Сделать импорт CSV/XLSX
- [x] Сделать переключатель выдачи

Фактически сделано:

- `frontend/app/admin/login/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/admin/templates/page.tsx`
- `frontend/app/admin/templates/[id]/page.tsx`
- `frontend/app/admin/templates/[id]/layout/page.tsx`
- `frontend/app/admin/participants/page.tsx`
- `frontend/app/admin/issuance/page.tsx`
- `seed-admin` CLI для создания первого admin-account

Оставшиеся хвосты этапа:

- drag-and-drop позиционирование в layout editor
- более богатый preview UX

### Этап 4. Ops and hardening

- [x] Логи действий админа
- [x] CAPTCHA/rate limit hardening
- [x] Redis integration
- [x] Cluster readiness и health checks
- [x] Тесты

Примечание:

- добавлен Redis-backed throttling для admin login и lock для выдачи сертификатов
- отдельный load test ещё не запускался

## 16. Acceptance criteria

Систему можно считать готовой к MVP, если:

- админ может зайти по логину и паролю
- админ может загрузить шаблон и настроить позицию имени
- админ может импортировать файл участников
- админ может включить выдачу
- пользователь по валидному e-mail получает PDF
- пользователь по невалидному или отсутствующему e-mail не получает лишних данных
- админские роуты недоступны без валидного JWT
- система переживает массовые одновременные запросы без дублирующей генерации одного сертификата
