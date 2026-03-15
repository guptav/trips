VENV      := .venv
PYTHON    := $(VENV)/bin/python
PIP       := $(VENV)/bin/pip
UVICORN   := $(VENV)/bin/uvicorn
PYTEST    := $(VENV)/bin/pytest

HOST      ?= 127.0.0.1
PORT      ?= 8000

.PHONY: all venv install run test lint clean

all: install

## Create the virtual environment
venv:
	python3 -m venv $(VENV)

## Install all dependencies (creates venv if needed)
install: venv
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

## Start the development server  (Ctrl-C to stop)
run: install
	$(UVICORN) main:app --host $(HOST) --port $(PORT) --reload

## Run the test suite
test: install
	$(PYTEST) test_main.py -v

## Lint the source with ruff (installed on demand)
lint: install
	$(PIP) install --quiet ruff
	$(VENV)/bin/ruff check main.py

## Remove generated artifacts
clean:
	rm -rf $(VENV) __pycache__ .pytest_cache trips.db
