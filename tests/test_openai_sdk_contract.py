import json
import unittest

from api._core import ANALYSIS_SCHEMA

try:
    import httpx
    from openai import OpenAI
except ImportError:
    httpx = None
    OpenAI = None


@unittest.skipUnless(OpenAI is not None and httpx is not None, "OpenAI SDK not installed")
class OpenAISDKContractTests(unittest.TestCase):
    def test_responses_api_serializes_structured_output_format(self):
        captured = {}

        def endpoint(request):
            captured["payload"] = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                json={
                    "id": "resp_test",
                    "object": "response",
                    "created_at": 0,
                    "status": "completed",
                    "model": "gpt-5.4-mini",
                    "output": [
                        {
                            "id": "msg_test",
                            "type": "message",
                            "status": "completed",
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": "{}",
                                    "annotations": [],
                                }
                            ],
                        }
                    ],
                },
            )

        transport = httpx.MockTransport(endpoint)
        http_client = httpx.Client(transport=transport)
        client = OpenAI(
            api_key="test-key",
            base_url="https://example.test/v1",
            http_client=http_client,
        )

        response = client.responses.create(
            model="gpt-5.4-mini",
            instructions="system instructions",
            input="incident input",
            text={
                "format": {
                    "type": "json_schema",
                    "name": "incident_analysis",
                    "strict": True,
                    "schema": ANALYSIS_SCHEMA,
                }
            },
            max_output_tokens=1_600,
            store=False,
        )

        self.assertEqual(response.output_text, "{}")
        response_format = captured["payload"]["text"]["format"]
        self.assertEqual(response_format["type"], "json_schema")
        self.assertEqual(response_format["schema"], ANALYSIS_SCHEMA)
        self.assertFalse(captured["payload"]["store"])


if __name__ == "__main__":
    unittest.main()
