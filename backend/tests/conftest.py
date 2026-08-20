from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app import main
from app.database import Base


@pytest.fixture()
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)

    def override_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    storage = tmp_path / "storage"
    storage.mkdir()
    monkeypatch.setattr(main, "STORAGE_DIR", storage)
    monkeypatch.setattr("app.analysis_service.STORAGE_DIR", storage)
    monkeypatch.setattr(main, "run_analysis", lambda _analysis_id: None)
    main.realtime_model_cache.clear()
    with main.rate_limit_lock:
        main.rate_limit_events.clear()
    main.app.dependency_overrides[main.get_db] = override_db
    test_client = TestClient(main.app)
    test_client.app.state.testing_session = testing_session
    try:
        yield test_client
    finally:
        test_client.close()
        main.realtime_model_cache.clear()
        with main.rate_limit_lock:
            main.rate_limit_events.clear()
    main.app.dependency_overrides.clear()
    engine.dispose()
