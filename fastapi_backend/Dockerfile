FROM python:3.12-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates

ADD https://astral.sh/uv/install.sh /uv-installer.sh
RUN sh /uv-installer.sh && rm /uv-installer.sh

ENV PATH="/root/.local/bin/:$PATH"

# 1. Force uv to place the virtual environment in a standard location
ENV UV_PROJECT_ENVIRONMENT=/opt/venv

COPY pyproject.toml uv.lock ./

# 2. Sync dependencies into the isolated /opt/venv directory
RUN uv sync --frozen --all-groups

# 3. Add the isolated venv path to your PATH
ENV PATH="/opt/venv/bin:$PATH"

COPY . .

# 4. Prevent your local .venv folder from overwriting the container
# (Make sure to also add .venv to your .dockerignore file!)
RUN rm -rf .venv

EXPOSE 8000

CMD ["./start.sh"]
