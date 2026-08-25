"""WSGI application exposing the OpsTriage analysis API."""

from __future__ import annotations

import json
import sys
from http import HTTPStatus
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from api._core import APIError, analyze_incident, validate_request


MAX_REQUEST_BYTES = 24_000
StartResponse = Callable[[str, List[Tuple[str, str]]], Any]


def _json_response(
    start_response: StartResponse,
    status: int,
    payload: Dict[str, Any],
    extra_headers: Optional[List[Tuple[str, str]]] = None,
) -> Iterable[bytes]:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    status_line = f"{status} {HTTPStatus(status).phrase}"
    headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(encoded))),
        ("Cache-Control", "no-store"),
        ("X-Content-Type-Options", "nosniff"),
    ]
    headers.extend(extra_headers or [])
    start_response(status_line, headers)
    return [encoded]


def _error_response(
    start_response: StartResponse,
    error: APIError,
    extra_headers: Optional[List[Tuple[str, str]]] = None,
) -> Iterable[bytes]:
    return _json_response(
        start_response,
        error.status,
        {
            "success": False,
            "error": {
                "code": error.code,
                "message": error.public_message,
            },
        },
        extra_headers,
    )


def _read_json_body(environ: Dict[str, Any]) -> Any:
    content_type = environ.get("CONTENT_TYPE", "").split(";", 1)[0].lower()
    if content_type != "application/json":
        raise APIError(
            415,
            "UNSUPPORTED_MEDIA_TYPE",
            "Content-Type은 application/json이어야 합니다.",
        )

    try:
        content_length = int(environ.get("CONTENT_LENGTH", "0") or "0")
    except ValueError as exc:
        raise APIError(
            400,
            "INVALID_REQUEST",
            "요청 본문을 읽을 수 없습니다.",
        ) from exc

    if content_length <= 0:
        raise APIError(
            400,
            "INVALID_JSON",
            "요청 본문에 JSON을 입력해주세요.",
        )
    if content_length > MAX_REQUEST_BYTES:
        raise APIError(
            413,
            "PAYLOAD_TOO_LARGE",
            "요청 내용이 너무 큽니다.",
        )

    raw_body = environ["wsgi.input"].read(content_length)
    try:
        return json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise APIError(
            400,
            "INVALID_JSON",
            "올바른 JSON 형식으로 요청해주세요.",
        ) from exc


def app(environ: Dict[str, Any], start_response: StartResponse) -> Iterable[bytes]:
    """Handle the single public endpoint using the WSGI interface Vercel expects."""

    path = environ.get("PATH_INFO", "")
    method = environ.get("REQUEST_METHOD", "GET").upper()

    if path.rstrip("/") != "/api/analyze":
        return _error_response(
            start_response,
            APIError(404, "NOT_FOUND", "요청한 API 경로를 찾을 수 없습니다."),
        )

    if method != "POST":
        return _error_response(
            start_response,
            APIError(
                405,
                "METHOD_NOT_ALLOWED",
                "POST 요청만 사용할 수 있습니다.",
            ),
            [("Allow", "POST")],
        )

    try:
        payload = _read_json_body(environ)
        incident = validate_request(payload)
        analysis = analyze_incident(incident)
        return _json_response(
            start_response,
            200,
            {"success": True, "data": analysis},
        )
    except APIError as exc:
        return _error_response(start_response, exc)
    except Exception as exc:  # Defensive boundary for the public endpoint.
        print(f"Unexpected API error: {type(exc).__name__}", file=sys.stderr)
        return _error_response(
            start_response,
            APIError(
                500,
                "INTERNAL_ERROR",
                "분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
            ),
        )
