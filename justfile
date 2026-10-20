default: test

# Install the test dependencies.
setup:
    uv sync

# Integration tests: build the image and run it behind the real OpenHost router (needs podman).
test:
    uv run pytest -x

# Build the image and run it locally on http://localhost:8080, with its data in ./dev-data.
run:
    podman build -t bottled-out-of-your-element .
    mkdir -p dev-data
    podman run --rm -it -p 8080:8080 -e BOTTLE_APP_DATA_DIR=/data/app_data/ooye -v "$PWD/dev-data:/data/app_data/ooye" bottled-out-of-your-element
