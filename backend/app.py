from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from openai import OpenAI
import json

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
print("OPENAI_API_KEY:", OPENAI_API_KEY)

# Initialize OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY)

app = Flask(__name__)
CORS(app)

# --- Helper: ask LLM to judge question ---
def get_question_guidance(question):
    """
    Uses GPT to check if the question is good or bad, and provide tips and suggested improved questions.
    """
    prompt = f"""
    You are a strict assistant that only allows good questions.
    A good question must be:
      - Specific and detailed
      - Clear and actionable
      - Include context, audience, or desired format if needed

    For the user question: "{question}"
    1. Decide if it is GOOD or BAD.
    2. If BAD, explain briefly why it is too vague or general.
    3. Provide 1-2 concrete tips to improve it, with examples of well-phrased questions.
    Respond in strict JSON format like:
    {{
        "status": "GOOD" or "BAD",
        "reason": "...",
        "tips": ["...", "..."]
    }}
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=250,
            temperature=0
        )

        guidance_text = response.choices[0].message.content
        guidance_json = json.loads(guidance_text)  # parse JSON
        return guidance_json
    except Exception as e:
        print("Error getting guidance:", e)
        # fallback if JSON fails
        return {
            "status": "BAD",
            "reason": "Could not parse guidance",
            "tips": ["Make your question specific and actionable."]
        }

# --- API route ---
@app.route("/ask", methods=["POST"])
def ask():
    data = request.json
    question = data.get("question", "").strip()
    print("Received question:", question)

    if not question:
        return jsonify({
            "status": "bad_question",
            "guidance": {
                "status": "BAD",
                "reason": "You sent an empty question.",
                "tips": ["Type a specific question about a topic you want to learn."]
            }
        })

    # Step 1: Check if question is good
    guidance = get_question_guidance(question)

    if guidance["status"] == "BAD":
        return jsonify({
            "status": "bad_question",
            "guidance": guidance
        })

    # Step 2: Question is GOOD → call GPT to answer
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": question}],
            max_tokens=400,
            temperature=0.7
        )
        answer = response.choices[0].message.content
        return jsonify({"status": "ok", "answer": answer})
    except Exception as e:
        return jsonify({"status": "error", "answer": f"⚠️ GPT API error: {str(e)}"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))  # Railway sets this automatically
    app.run(host="0.0.0.0", port=port)
