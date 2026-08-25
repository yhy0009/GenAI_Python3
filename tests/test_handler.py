import json
import unittest
from io import BytesIO
from unittest.mock import patch

from api.analyze import app


VALID_PAYLOAD = {
    "service_name": "Payment API",
    "environment": "Production",
    "symptom": "결제 요청에서 502 오류가 증가했습니다.",
    "logs": "upstream timed out",
    "recent_changes": "새 버전을 배포했습니다.",
}

VALID_ANALYSIS = {
    "summary": "결제 API에서 502 오류가 증가한 상황입니다.",
    "severity": "SEV-2",
    "possible_causes": [
        {
            "cause": "업스트림 응답 지연",
            "reason": "타임아웃 로그가 확인됩니다.",
        }
    ],
    "first_checks": ["응답 시간을 확인합니다."],
    "mitigations": ["담당자 검토 후 롤백을 검토합니다."],
    "communication": "현재 오류 증가 현상을 조사하고 있습니다.",
    "additional_information": ["배포 버전"],
}


def invoke_app(
    method="GET",
    path="/api/analyze",
    body=b"",
    content_type="application/json",
):
    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "CONTENT_TYPE": content_type,
        "CONTENT_LENGTH": str(len(body)),
        "wsgi.input": BytesIO(body),
    }
    response = {}

    def start_response(status, headers):
        response["status"] = int(status.split(" ", 1)[0])
        response["headers"] = dict(headers)

    response_body = b"".join(app(environ, start_response))
    response["body"] = json.loads(response_body.decode("utf-8"))
    return response


class HandlerTests(unittest.TestCase):
    def test_post_returns_success_envelope(self):
        body = json.dumps(VALID_PAYLOAD, ensure_ascii=False).encode("utf-8")

        with patch("api.analyze.analyze_incident", return_value=VALID_ANALYSIS):
            response = invoke_app(method="POST", body=body)

        self.assertEqual(response["status"], 200)
        self.assertTrue(response["body"]["success"])
        self.assertEqual(response["body"]["data"], VALID_ANALYSIS)

    def test_invalid_json_returns_400(self):
        response = invoke_app(method="POST", body=b"not-json")

        self.assertEqual(response["status"], 400)
        self.assertEqual(response["body"]["error"]["code"], "INVALID_JSON")

    def test_wrong_content_type_returns_415(self):
        response = invoke_app(
            method="POST",
            body=b"text",
            content_type="text/plain",
        )

        self.assertEqual(response["status"], 415)
        self.assertEqual(
            response["body"]["error"]["code"],
            "UNSUPPORTED_MEDIA_TYPE",
        )

    def test_get_returns_405_and_allow_header(self):
        response = invoke_app()

        self.assertEqual(response["status"], 405)
        self.assertEqual(response["headers"]["Allow"], "POST")
        self.assertEqual(
            response["body"]["error"]["code"],
            "METHOD_NOT_ALLOWED",
        )

    def test_unknown_path_returns_404(self):
        response = invoke_app(path="/api/missing")

        self.assertEqual(response["status"], 404)
        self.assertEqual(response["body"]["error"]["code"], "NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
