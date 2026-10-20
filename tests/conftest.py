from collections.abc import Iterator

import pytest
from openhost_test_harness import OpenhostStack


@pytest.fixture(scope="session")
def stack() -> Iterator[OpenhostStack]:
    with OpenhostStack() as s:
        yield s
