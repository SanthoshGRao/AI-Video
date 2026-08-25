import os

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

try:
    models = client.models.list()
    print("✅ API Key is valid")
except Exception as e:
    print("❌ Invalid API Key")
    print(e)