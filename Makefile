.PHONY: install build lint test ingest start

install:
	npm ci

build:
	npm run build

lint:
	npm run lint

test:
	npm test

ingest:
	npm run ingest

start:
	npm start
