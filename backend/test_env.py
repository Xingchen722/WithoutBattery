from dotenv import load_dotenv
import os

# Load variables from .env
load_dotenv()

# Get API key
api_key = os.getenv("OPENAI_API_KEY")

if api_key:
    print("✅ API key loaded successfully!")
    print(f"Your key (first 10 chars only): {api_key[:10]}...")
else:
    print("❌ API key NOT found.")
