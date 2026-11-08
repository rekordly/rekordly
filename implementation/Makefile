COMPOSE := docker compose -f docker-compose.yml

.PHONY: dev backend down reset-local-db logs migrate build-all api-test worker-test web-test

dev:
	$(COMPOSE) up --build

backend:
	$(COMPOSE) up --build rekordly-postgres rekordly-migrate rekordly-api

down:
	$(COMPOSE) down

reset-local-db:
	$(COMPOSE) down --volumes

logs:
	$(COMPOSE) logs --follow --tail=200

migrate:
	$(COMPOSE) run --rm rekordly-migrate

build-all:
	$(COMPOSE) build

api-test:
	docker run --rm -v "$(CURDIR)/api:/src" -w /src golang:1.22-alpine go test ./...

worker-test:
	docker run --rm -v "$(CURDIR)/worker:/src" -w /src golang:1.22-alpine go test ./...

web-test:
	cd web && npm run test
