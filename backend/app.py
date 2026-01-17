from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from openai import OpenAI  # new interface

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
print("OPENAI_API_KEY:", OPENAI_API_KEY)

# Initialize OpenAI client

client = OpenAI(api_key=OPENAI_API_KEY)

app = Flask(__name__)
CORS(app)  # allow frontend to call backend

# --- Helper: check if question is "good" ---
def is_good_question(prompt):
    prompt = prompt.lower()
    role_keywords = ["act as", "explain like", "/eli5"]
    objective_keywords = ["write", "generate", "summarize", "analyze", "create", "explain"]
    context_keywords = ["for", "assuming", "targeting", "audience"]
    format_keywords = ["table", "bullet", "/checklist", "/step-by-step", "under", "words", "columns"]
    example_keywords = ["example", "like this paragraph", "[paste example]"]

    score = sum([
        any(word in prompt for word in role_keywords),
        any(word in prompt for word in objective_keywords),
        any(word in prompt for word in context_keywords),
        any(word in prompt for word in format_keywords),
        any(word in prompt for word in example_keywords)
    ])
    return score >= 1  # allow more natural questions

# --- API route ---
@app.route("/ask", methods=["POST"])
def ask():
    data = request.json
    print("Received POST /ask with data:", data)  # debug
    question = data.get("question", "")

    if not is_good_question(question):
        return jsonify({
            "answer": "🤖 Your question is too vague or unclear. Try adding a role, context, or format!"
        })

    try:

        # New OpenAI API call
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": question}],
            max_tokens=300,
            temperature=0.7
        )

        answer = response.choices[0].message.content
        return jsonify({"answer": answer})
    except Exception as e:
        return jsonify({"answer": f"⚠️ Error calling GPT API: {str(e)}"})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
