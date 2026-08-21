from openai import OpenAI

client = OpenAI(api_key="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")

try:
    models = client.models.list()
    print("✅ API Key is valid")
except Exception as e:
    print("❌ Invalid API Key")
    print(e)